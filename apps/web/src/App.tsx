import { lazy, Suspense } from "react";
import { HomeView } from "./views/HomeView.js";
import { routeHref, useRoute } from "./router.js";

// Las vistas poco frecuentes se cargan al abrirlas: la portada llega antes.
const AnalysisView = lazy(() =>
  import("./views/AnalysisView.js").then((module) => ({ default: module.AnalysisView })),
);
const ComparisonView = lazy(() =>
  import("./views/ComparisonView.js").then((module) => ({ default: module.ComparisonView })),
);
const HistoryView = lazy(() =>
  import("./views/HistoryView.js").then((module) => ({ default: module.HistoryView })),
);

export function App() {
  const route = useRoute();

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <p className="brand">
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="4.5" cy="17" r="3" fill="currentColor" />
            <circle cx="19.5" cy="17" r="3" fill="currentColor" />
            <path
              d="M7 17C8.5 7 15.5 7 17 17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          Pink Bridge
        </p>
        <nav aria-label="Principal">
          <ul className="nav-list">
            <li>
              <a href={routeHref("home")} aria-current={route.name === "home" ? "page" : undefined}>
                Revisar una página
              </a>
            </li>
            <li>
              <a
                href={routeHref("history")}
                aria-current={route.name === "history" ? "page" : undefined}
              >
                Mis revisiones
              </a>
            </li>
          </ul>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>
        <div key={route.name === "analysis" ? route.id : route.name} className="view-enter">
          <Suspense fallback={<p role="status">Cargando…</p>}>
            {route.name === "home" && <HomeView />}
            {route.name === "history" && <HistoryView />}
            {route.name === "analysis" && <AnalysisView key={route.id} id={route.id} />}
            {route.name === "compare" && (
              <ComparisonView key={`${route.from}-${route.to}`} from={route.from} to={route.to} />
            )}
            {route.name === "notFound" && (
              <section className="card">
                <h1 tabIndex={-1}>No encontramos esta página</h1>
                <p>Puede que la dirección esté mal escrita o que la página ya no exista.</p>
                <p>
                  <a href={routeHref("home")}>Volver al inicio</a>
                </p>
              </section>
            )}
          </Suspense>
        </div>
      </main>
    </>
  );
}
