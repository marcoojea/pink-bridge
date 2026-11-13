import { AnalysisView } from "./views/AnalysisView.js";
import { ComparisonView } from "./views/ComparisonView.js";
import { HistoryView } from "./views/HistoryView.js";
import { HomeView } from "./views/HomeView.js";
import { routeHref, useRoute } from "./router.js";

export function App() {
  const route = useRoute();

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <p className="brand">Pink Bridge</p>
        <nav aria-label="Principal">
          <ul className="nav-list">
            <li>
              <a href={routeHref("home")} aria-current={route.name === "home" ? "page" : undefined}>
                Nuevo análisis
              </a>
            </li>
            <li>
              <a
                href={routeHref("history")}
                aria-current={route.name === "history" ? "page" : undefined}
              >
                Histórico
              </a>
            </li>
          </ul>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1}>
        <div key={route.name === "analysis" ? route.id : route.name} className="view-enter">
          {route.name === "home" && <HomeView />}
          {route.name === "history" && <HistoryView />}
          {route.name === "analysis" && <AnalysisView key={route.id} id={route.id} />}
          {route.name === "compare" && (
            <ComparisonView key={`${route.from}-${route.to}`} from={route.from} to={route.to} />
          )}
          {route.name === "notFound" && (
            <section className="card">
              <h1 tabIndex={-1}>Página no encontrada</h1>
              <p>
                <a href={routeHref("home")}>Volver al inicio</a>
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
