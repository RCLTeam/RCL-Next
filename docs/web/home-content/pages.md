# Vistas Ensambladoras (Smart Pages): Editorial Home Content

[⬅️ Volver a Hooks](hooks.md) | [Siguiente: Tipos ➡️](types.md)

---

## 1. Visión General de las Vistas Ensambladoras

Siguiendo el patrón **Smart Pages** del monorepo, las páginas actúan como orquestadores de alto nivel. Su cometido es:
1. Conectar los hooks headless (`useHomeContent`, `useCompetition`, `useAuth`) con los componentes de presentación puros (*Dumb UI*).
2. Manejar la navegación y sincronización con los parámetros de la URL.
3. Montar modales accesibles y paneles administrativos sin acoplar lógica visual de detalle.

---

## 2. Página Principal: `HomePage.tsx` (`apps/web/src/site/pages/home/HomePage.tsx`)

`HomePage` es el punto de entrada público principal del portal web. Ensambla la identidad de la liga, la retransmisión en directo, los enfrentamientos destacados, la tira del quinteto ideal y la cuadrícula editorial:

```tsx
// apps/web/src/site/pages/home/HomePage.tsx:55-60
<HomeHero seasonName={competition.season?.name} streamUrl={stream} />
<HomeFeaturedMatch featured={featured} />
<TeamOfTheWeekStrip competition={competition} />
<EditorialGrid />
{articleId && <EditorialPage key={articleId} articleId={articleId} />}
```

### Integración de Componentes Editoriales:
- **`TeamOfTheWeekStrip`:** Recibe el objeto `competition` para conocer la división seleccionada actualmente y renderizar el quinteto ideal correspondiente.
- **`EditorialGrid`:** Se ubica tras el quinteto de la jornada, mostrando el artículo más reciente como banner principal y una lista ordenada de artículos complementarios.
- **Superposición Modal de Lectura (`EditorialPage`):** Si la ruta activa contiene un parámetro de artículo (por ejemplo, `/editorial/:articleId`), `HomePage` monta dinámicamente `EditorialPage` como un diálogo modal accesible sin perder el contexto visual de la página de inicio.

---

## 3. Modal de Lectura: `EditorialPage.tsx` (`apps/web/src/site/pages/editorial/EditorialPage.tsx`)

`EditorialPage` es una vista modal especializada diseñada para ofrecer una experiencia de lectura inmersiva y sin distracciones.

```tsx
// apps/web/src/site/pages/editorial/EditorialPage.tsx:9-30
export function EditorialPage({ articleId }: { articleId: string }) {
  const content = useHomeContent<EditorialArticle>(`articles/${encodeURIComponent(articleId)}`);
  const navigate = useNavigate();

  const handleClose = () => {
    navigate('/');
  };
  const modalTitle = (
    <span className="editorial-dialog-label">Editorial · Crónica de la Rebelión</span>
  );

  return (
    <Modal title={modalTitle} onClose={handleClose} maxWidth="1000px">
      <div className="editorial-modal-content">
        <ContentStatus {...content} />
        {content.data && (
          <ArticleView article={content.data} publishedAt={content.data.publishedAt} />
        )}
      </div>
    </Modal>
  );
}
```

### Características de Diseño:
- **Carga Desacoplada:** Invoca `useHomeContent<EditorialArticle>('articles/' + encodeURIComponent(articleId))`, asegurando la sanitización del identificador en la URL.
- **Navegación Limpia:** Al pulsar el botón de cierre del modal o la tecla de escape (`Esc`), el manejador `handleClose` invoca `navigate('/')` para retornar fluidamente a la página de inicio.
- **Ancho Óptimo de Lectura:** El contenedor modal restringe su anchura a un máximo de `1000px`, asegurando una longitud de línea cómoda para la vista y tipografía editorial optimizada.

---

## 4. Panel de Administración: `AdminPage.tsx` (`apps/web/src/site/pages/admin/AdminPage.tsx`)

El panel de administración monta `HomeContentPanel` como una pestaña de primer nivel bajo la ruta `/admin/home-content`:

```tsx
// apps/web/src/site/pages/admin/AdminPage.tsx:50-53
<nav className="admin-nav" aria-label="Secciones de administración">
  {/* Enlaces de navegación administrativa ... */}
</nav>
{path === '/admin/home-content' ? (
  <HomeContentPanel />
) : path === '/admin/rofl/upload' ? (
  // ...
```

### Funciones Orquestadas en `HomeContentPanel`:
1. **Gestión de Quintetos Ideales (`WeeklyTeamManager`):** Permite a los administradores seleccionar la temporada, la división y la jornada deportiva, consultar los jugadores candidatos verificados por la base de datos y asignar el quinteto ideal con publicación inmediata.
2. **Gestión Editorial (`EditorialManager`):** Permite redactar artículos, alternar el estado de borrador/publicado, configurar la visibilidad en inicio (`showOnHome`), subir imágenes y previsualizar el resultado antes de confirmar la publicación.
