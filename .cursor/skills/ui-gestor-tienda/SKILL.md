---
name: ui-gestor-tienda
description: >-
  Designs and builds UI for the gestor de tienda de barrio (Mostrador) with
  React, shadcn/ui and Tailwind CSS v4: glass surfaces, mesh gradients,
  saffron-clay-moss palette, and responsive layouts. Use when creating or
  restyling screens of tienda, Mostrador, the POS, login, catálogo público,
  or when the user asks for this design skill.
---

# UI Mostrador (gestor de tienda)

Skill de interfaz para **este** producto. El brief original era Vue, PrimeVue y un login universitario azul. Aquí no aplica.

## Stack de esta UI

- React, Composition vía componentes funcionales.
- Tailwind CSS v4 (`@import "tailwindcss"`, tokens en `@theme`).
- shadcn/ui: `cva`, `cn`, componentes en `src/components/ui`. Estilizar con clases Tailwind. No dejar el tema gris por defecto.
- Iconos: `lucide-react`.
- Tipografía: Plus Jakarta Sans.

No usar Vue, PrimeVue ni `pt` / modo unstyled.

## Paleta

No usar azul institucional ni el azul genérico de dashboards.

| Token | Hex | Uso |
|---|---|---|
| night | `#140f0c` | Login y panel de marca |
| ink | `#1c1612` | Texto y botones sólidos en claro |
| paper | `#f3eee6` | Fondo de la app de día |
| cream | `#faf7f2` | Tarjetas |
| saffron | `#e2a122` | Acento, foco, marca |
| clay | `#d4653a` | Gradiente del botón principal y alertas cálidas |
| moss | `#3f6f56` | Stock sano, éxito |
| muted | `#6d6258` | Texto secundario |

En claro, el texto ink sobre paper/cream cumple contraste AA. En el login oscuro, texto cream sobre night. El azafrán no es color de texto pequeño sobre crema.

## Login

- Lienzo `night` a pantalla completa con mesh: tres radiales (`bg-saffron/30`, `bg-clay/25`, `bg-moss/20`) y `blur-3xl`, más una retícula de puntos sutil.
- Desktop (`md` en adelante): grilla de 12. Marca en 7 columnas, formulario centrado en 5. `min-h-dvh`.
- Mobile: ocultar el panel grande. Encabezado compacto y la misma luz de fondo. Tarjeta con `px-4`, ancho completo, `max-w-md`.
- Tarjeta: `backdrop-blur-xl`, `bg-white/10`, `border border-white/10`, `rounded-3xl`, sombra amplia.
- Inputs y el botón principal con altura mínima 44px. Foco `ring-2 ring-saffron` y `transition-all duration-300`.
- Botón Entrar: gradiente saffron → clay, brillo en hover (`before` que cruza), `active:scale-[0.98]`, spinner si carga.
- Error en `role="alert"`. Labels reales, `focus-visible` visible, `autoComplete` correcto.

## App de día (POS y el resto)

- Fondo paper con dos glows muy suaves. La caja se usa con luz de día: superficies cream, no un dashboard negro.
- Tarjetas: `bg-cream/80 backdrop-blur-xl border border-ink/10` y sombra difusa.
- Números con `tabular-nums`.
- POS: favoritos en botones grandes, búsqueda arriba, escaner accesible, carrito en columna desde `lg` y en barra fija abajo en móvil.
- Nav inferior en `< md` (Mostrador, Fiados, Hoy, Menú). Lateral desde `md`.

## Microcopy

Español, corto, de tienda. Nada de "Welcome back" ni jerga de panel admin.
