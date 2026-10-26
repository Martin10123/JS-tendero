import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Unidad } from '@prisma/client';
import { Workbook } from 'exceljs';
import { CurrentUser, Roles } from './auth.guard';
import { AuthUser, pesos, registrarMovimiento, vistaProducto } from './lib';
import { PrismaService } from './prisma.service';
import { TiendaEvents } from './tienda.events';

const UNIDADES = new Set(['und', 'kg', 'lb', 'l']);

@Controller()
export class ProductosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: TiendaEvents,
  ) {}

  @Get('categorias')
  categorias(@CurrentUser() user: AuthUser) {
    return this.prisma.categoria.findMany({
      where: { tiendaId: user.tiendaId },
      orderBy: { orden: 'asc' },
    });
  }

  @Roles('dueno')
  @Post('categorias')
  crearCategoria(@CurrentUser() user: AuthUser, @Body() body: { nombre?: string; orden?: number }) {
    const nombre = body.nombre?.trim();
    if (!nombre) throw new BadRequestException('La categoría necesita nombre');
    return this.prisma.categoria.create({
      data: { tiendaId: user.tiendaId, nombre, orden: Number(body.orden) || 0 },
    });
  }

  @Get('productos')
  async listar(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    const productos = await this.prisma.producto.findMany({
      where: {
        tiendaId: user.tiendaId,
        activo: true,
        ...(q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {}),
      },
      include: { categoria: true },
      orderBy: [{ esFavorito: 'desc' }, { nombre: 'asc' }],
    });
    return productos.map((producto) => vistaProducto(producto, user.rol));
  }

  @Get('productos/barcode/:codigo')
  async porCodigo(@CurrentUser() user: AuthUser, @Param('codigo') codigo: string) {
    const producto = await this.prisma.producto.findFirst({
      where: { tiendaId: user.tiendaId, codigoBarras: codigo, activo: true },
      include: { categoria: true },
    });
    if (!producto) throw new BadRequestException('Ese código no está en la tienda');
    return vistaProducto(producto, user.rol);
  }

  @Roles('dueno')
  @Post('productos')
  async crear(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const producto = await this.guardar(user, body, null);
    return vistaProducto(producto, user.rol);
  }

  @Roles('dueno')
  @Patch('productos/:id')
  async editar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const existe = await this.prisma.producto.findFirst({
      where: { id, tiendaId: user.tiendaId },
      include: { categoria: true },
    });
    if (!existe) throw new BadRequestException('Producto no encontrado');
    const producto = await this.prisma.producto.update({
      where: { id },
      data: {
        nombre: body.nombre ? String(body.nombre).trim() : undefined,
        categoriaId: body.categoriaId ? String(body.categoriaId) : undefined,
        codigoBarras:
          body.codigoBarras === null
            ? null
            : body.codigoBarras
              ? String(body.codigoBarras).trim()
              : undefined,
        unidad: body.unidad && UNIDADES.has(String(body.unidad)) ? (body.unidad as Unidad) : undefined,
        costo: body.costo === undefined ? undefined : pesos(body.costo, 'Costo'),
        precio: body.precio === undefined ? undefined : pesos(body.precio, 'Precio'),
        stockMinimo:
          body.stockMinimo === undefined
            ? undefined
            : Math.max(0, Math.round(Number(body.stockMinimo) * 1000)),
        esFavorito: body.esFavorito === undefined ? undefined : Boolean(body.esFavorito),
        visibleCatalogo:
          body.visibleCatalogo === undefined ? undefined : Boolean(body.visibleCatalogo),
        activo: body.activo === undefined ? undefined : Boolean(body.activo),
      },
      include: { categoria: true },
    });
    this.eventos.emitir(user.tiendaId);
    return vistaProducto(producto, user.rol);
  }

  @Roles('dueno')
  @Post('productos/importar')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 5_000_000 } }))
  async importar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() archivo?: Express.Multer.File,
  ) {
    if (!archivo?.buffer?.length) throw new BadRequestException('Adjunta un Excel o CSV');
    const filas = archivo.originalname.toLowerCase().endsWith('.csv')
      ? this.leerCsv(archivo.buffer)
      : await this.leerExcel(archivo.buffer);
    let creados = 0;
    for (const fila of filas) {
      if (!fila.nombre) continue;
      const categoria = await this.prisma.categoria.upsert({
        where: { tiendaId_nombre: { tiendaId: user.tiendaId, nombre: fila.categoria || 'General' } },
        update: {},
        create: { tiendaId: user.tiendaId, nombre: fila.categoria || 'General' },
      });
      const stock = Math.round((Number(fila.stock) || 0) * 1000);
      const data = {
        categoriaId: categoria.id,
        nombre: fila.nombre,
        codigoBarras: fila.codigo || null,
        unidad: (UNIDADES.has(fila.unidad) ? fila.unidad : 'und') as Unidad,
        costo: Math.round(Number(fila.costo) || 0),
        precio: Math.round(Number(fila.precio) || 0),
        stockMinimo: Math.round((Number(fila.minimo) || 0) * 1000),
      };
      const previo = fila.codigo
        ? await this.prisma.producto.findFirst({
            where: { tiendaId: user.tiendaId, codigoBarras: fila.codigo },
          })
        : await this.prisma.producto.findFirst({
            where: { tiendaId: user.tiendaId, nombre: fila.nombre },
          });
      await this.prisma.$transaction(async (tx) => {
        const producto = previo
          ? await tx.producto.update({ where: { id: previo.id }, data })
          : await tx.producto.create({ data: { ...data, tiendaId: user.tiendaId, stockActual: 0 } });
        const delta = stock - (previo?.stockActual ?? 0);
        if (delta !== 0) {
          await registrarMovimiento(tx, {
            tiendaId: user.tiendaId,
            productoId: producto.id,
            tipo: 'ajuste',
            delta,
            costoUnitario: data.costo,
            usuarioId: user.sub,
            referenciaTipo: 'importacion',
            nota: 'Carga inicial',
          });
        }
      });
      creados += 1;
    }
    this.eventos.emitir(user.tiendaId);
    return { importados: creados };
  }

  private async guardar(user: AuthUser, body: Record<string, unknown>, id: string | null) {
    const nombre = String(body.nombre ?? '').trim();
    if (!nombre) throw new BadRequestException('El producto necesita nombre');
    const categoriaId = String(body.categoriaId ?? '');
    const categoria = await this.prisma.categoria.findFirst({
      where: { id: categoriaId, tiendaId: user.tiendaId },
    });
    if (!categoria) throw new BadRequestException('Elige una categoría');
    const unidad = String(body.unidad ?? 'und');
    if (!UNIDADES.has(unidad)) throw new BadRequestException('Unidad no válida');
    const stockInicial = body.stockActual === undefined ? 0 : Math.round(Number(body.stockActual) * 1000);
    if (stockInicial < 0) throw new BadRequestException('El stock no puede ser negativo');
    return this.prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({
        data: {
          tiendaId: user.tiendaId,
          categoriaId,
          nombre,
          codigoBarras: body.codigoBarras ? String(body.codigoBarras).trim() : null,
          unidad: unidad as Unidad,
          costo: pesos(body.costo ?? 0, 'Costo'),
          precio: pesos(body.precio ?? 0, 'Precio'),
          stockActual: 0,
          stockMinimo: Math.max(0, Math.round(Number(body.stockMinimo ?? 0) * 1000)),
          esFavorito: Boolean(body.esFavorito),
          visibleCatalogo: Boolean(body.visibleCatalogo),
        },
        include: { categoria: true },
      });
      if (stockInicial > 0) {
        await registrarMovimiento(tx, {
          tiendaId: user.tiendaId,
          productoId: producto.id,
          tipo: 'ajuste',
          delta: stockInicial,
          costoUnitario: producto.costo,
          usuarioId: user.sub,
          referenciaTipo: 'apertura',
          nota: 'Stock inicial',
        });
      }
      return tx.producto.findUniqueOrThrow({
        where: { id: producto.id },
        include: { categoria: true },
      });
    });
  }

  private leerCsv(buffer: Buffer) {
    const texto = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lineas = texto.split(/\r?\n/).filter((linea) => linea.trim());
    const sep = (lineas[0] || '').includes(';') ? ';' : ',';
    const encabezados = (lineas.shift() || '').split(sep).map((h) => this.clave(h));
    return lineas.map((linea) => this.fila(encabezados, linea.split(sep)));
  }

  private async leerExcel(buffer: Buffer) {
    const libro = new Workbook();
    await libro.xlsx.load(buffer as unknown as ArrayBuffer);
    const hoja = libro.worksheets[0];
    if (!hoja) return [];
    const encabezados: string[] = [];
    hoja.getRow(1).eachCell((celda, col) => {
      encabezados[col] = this.clave(String(celda.value ?? ''));
    });
    const filas: ReturnType<ProductosController['fila']>[] = [];
    hoja.eachRow((fila, numero) => {
      if (numero === 1) return;
      const valores: string[] = [];
      encabezados.forEach((_, col) => {
        const valor = fila.getCell(col).value;
        valores[col] = valor == null ? '' : String((valor as { text?: string }).text ?? valor);
      });
      filas.push(this.fila(encabezados, valores));
    });
    return filas;
  }

  private clave(valor: string) {
    return valor
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  }

  private fila(encabezados: string[], celdas: string[]) {
    const toma = (...nombres: string[]) => {
      const indice = encabezados.findIndex((h) => nombres.includes(h));
      return indice >= 0 ? String(celdas[indice] ?? '').trim() : '';
    };
    return {
      nombre: toma('nombre', 'producto'),
      codigo: toma('codigo', 'codigo_barras', 'barras'),
      costo: toma('costo'),
      precio: toma('precio'),
      stock: toma('stock', 'cantidad'),
      unidad: toma('unidad') || 'und',
      categoria: toma('categoria') || 'General',
      minimo: toma('stock_minimo', 'minimo'),
    };
  }
}
