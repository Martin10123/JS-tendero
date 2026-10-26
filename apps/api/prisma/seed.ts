import { PrismaClient, Unidad } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const M = 1000;

async function main() {
  const ya = await prisma.tienda.findUnique({ where: { slug: 'la-esquina' } });
  if (ya) return;

  const clave = await bcrypt.hash('demo1234', 10);
  const tienda = await prisma.tienda.create({
    data: {
      nombre: 'La Esquina',
      slug: 'la-esquina',
      telefonoWhatsapp: '573001111111',
    },
  });
  const dueno = await prisma.usuario.create({
    data: { tiendaId: tienda.id, nombre: 'Doña Rosa', telefono: '3001111111', claveHash: clave, rol: 'dueno' },
  });
  await prisma.usuario.create({
    data: { tiendaId: tienda.id, nombre: 'Camilo', telefono: '3002222222', claveHash: clave, rol: 'empleado' },
  });

  const nombres = ['Abarrotes', 'Lácteos', 'Bebidas', 'Aseo', 'Fruver'];
  const categorias = new Map<string, string>();
  for (const [orden, nombre] of nombres.entries()) {
    const categoria = await prisma.categoria.create({
      data: { tiendaId: tienda.id, nombre, orden },
    });
    categorias.set(nombre, categoria.id);
  }

  const catalogo: [string, string, string, number, number, number, number, Unidad, boolean][] = [
    ['Leche Alquería 1L', '7702006400194', 'Lácteos', 3800, 4500, 24, 8, 'und', true],
    ['Leche en polvo', '7702001100011', 'Lácteos', 12000, 15000, 10, 3, 'und', true],
    ['Queso campesino', '7702001100028', 'Lácteos', 14000, 18000, 4.5, 1, 'kg', true],
    ['Huevos x30', '7701000000030', 'Abarrotes', 15000, 18000, 12, 4, 'und', true],
    ['Pan tajado', '7701000000006', 'Abarrotes', 3500, 5000, 15, 4, 'und', true],
    ['Arroz Diana 500g', '7702354000015', 'Abarrotes', 2200, 2800, 30, 10, 'und', true],
    ['Aceite 1L', '7702005000018', 'Abarrotes', 9800, 12000, 14, 4, 'und', false],
    ['Café 250g', '7702003000012', 'Abarrotes', 6800, 8500, 10, 3, 'und', true],
    ['Azúcar 1kg', '7702004000019', 'Abarrotes', 3200, 4000, 18, 6, 'und', false],
    ['Pasta 250g', '7702007000016', 'Abarrotes', 1800, 2800, 20, 6, 'und', true],
    ['Frijol 500g', '7702007000023', 'Abarrotes', 4800, 6200, 8, 3, 'und', false],
    ['Atún', '7702008000013', 'Abarrotes', 4200, 5500, 16, 5, 'und', true],
    ['Galletas', '7702009000010', 'Abarrotes', 1400, 2200, 22, 6, 'und', true],
    ['Chocolate', '7702010000014', 'Abarrotes', 1600, 2500, 18, 5, 'und', true],
    ['Sal', '7702011000011', 'Abarrotes', 900, 1500, 10, 3, 'und', false],
    ['Arepa x6', '7702012000018', 'Abarrotes', 2800, 4000, 12, 4, 'und', true],
    ['Gaseosa 1.5L', '7703000000015', 'Bebidas', 3200, 4500, 20, 6, 'und', true],
    ['Agua 600ml', '7703000000022', 'Bebidas', 1200, 2000, 30, 8, 'und', true],
    ['Cerveza', '7703000000039', 'Bebidas', 2800, 4000, 24, 6, 'und', false],
    ['Jabón', '7704000000012', 'Aseo', 2400, 3500, 14, 4, 'und', true],
    ['Papel higiénico', '7704000000029', 'Aseo', 4800, 6500, 10, 3, 'und', false],
    ['Detergente', '7704000000036', 'Aseo', 7000, 9000, 8, 2, 'und', false],
    ['Tomate', '7705000000019', 'Fruver', 2000, 3200, 6, 2, 'kg', true],
    ['Banano', '7705000000026', 'Fruver', 1500, 2500, 8, 2, 'kg', true],
  ];

  const ids = new Map<string, string>();
  for (const [nombre, codigo, categoria, costo, precio, stock, minimo, unidad, favorito] of catalogo) {
    const producto = await prisma.producto.create({
      data: {
        tiendaId: tienda.id,
        categoriaId: categorias.get(categoria)!,
        nombre,
        codigoBarras: codigo,
        unidad,
        costo,
        precio,
        stockActual: Math.round(stock * M),
        stockMinimo: Math.round(minimo * M),
        esFavorito: favorito,
        visibleCatalogo: true,
      },
    });
    ids.set(nombre, producto.id);
    await prisma.movimientoInventario.create({
      data: {
        tiendaId: tienda.id,
        productoId: producto.id,
        tipo: 'ajuste',
        cantidad: Math.round(stock * M),
        costoUnitario: costo,
        usuarioId: dueno.id,
        referenciaTipo: 'apertura',
        nota: 'Carga inicial',
      },
    });
  }

  const marta = await prisma.cliente.create({
    data: { tiendaId: tienda.id, nombre: 'Marta López', telefono: '3003333331', limiteCredito: 100000, score: 60 },
  });
  await prisma.cliente.create({
    data: { tiendaId: tienda.id, nombre: 'José Pérez', telefono: '3003333332', limiteCredito: 50000, score: 90 },
  });
  await prisma.cliente.create({
    data: { tiendaId: tienda.id, nombre: 'Ana Díaz', telefono: '3003333333', limiteCredito: 0, score: 100 },
  });

  const leche = ids.get('Leche Alquería 1L')!;
  const hace = new Date(Date.now() - 40 * 86400000);
  const venta = await prisma.venta.create({
    data: {
      tiendaId: tienda.id,
      clienteId: marta.id,
      usuarioId: dueno.id,
      total: 9000,
      metodoPago: 'fiado',
      origen: 'pos',
      fecha: hace,
      items: {
        create: {
          tiendaId: tienda.id,
          productoId: leche,
          cantidad: 2 * M,
          precioUnitario: 4500,
          costoUnitario: 3800,
        },
      },
    },
  });
  await prisma.producto.update({ where: { id: leche }, data: { stockActual: { decrement: 2 * M } } });
  await prisma.movimientoInventario.create({
    data: {
      tiendaId: tienda.id,
      productoId: leche,
      tipo: 'venta',
      cantidad: -2 * M,
      costoUnitario: 3800,
      referenciaTipo: 'venta',
      referenciaId: venta.id,
      usuarioId: dueno.id,
    },
  });
  await prisma.fiado.create({
    data: {
      tiendaId: tienda.id,
      clienteId: marta.id,
      ventaId: venta.id,
      montoOriginal: 9000,
      saldo: 9000,
      fecha: hace,
    },
  });

  const proveedor = await prisma.proveedor.create({
    data: { tiendaId: tienda.id, nombre: 'Distribuidora del Norte', contacto: 'Pedro', telefono: '3004444444', notas: 'Lácteos y abarrotes' },
  });
  const queso = ids.get('Queso campesino')!;
  const compra = await prisma.compra.create({
    data: {
      tiendaId: tienda.id,
      proveedorId: proveedor.id,
      total: 28000,
      estado: 'recibida',
      fechaLlegada: new Date(),
      pagada: false,
      saldoProveedor: 28000,
      items: {
        create: {
          tiendaId: tienda.id,
          productoId: queso,
          cantidad: 2 * M,
          costoUnitario: 14000,
          fechaVencimiento: new Date(Date.now() + 3 * 86400000),
        },
      },
    },
    include: { items: true },
  });
  await prisma.lote.create({
    data: {
      tiendaId: tienda.id,
      productoId: queso,
      compraItemId: compra.items[0].id,
      cantidadRestante: 2 * M,
      fechaVencimiento: new Date(Date.now() + 3 * 86400000),
    },
  });
  await prisma.meta.create({
    data: { tiendaId: tienda.id, periodo: 'dia', fechaInicio: new Date(), montoObjetivo: 200000 },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
