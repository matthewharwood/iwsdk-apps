import { cardProofFixtures, cardProofSources } from "@iwsdk-apps/card-design/fixtures";
import { Card } from "@iwsdk-apps/card-design/react";
import "@iwsdk-apps/card-design/styles.css";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import "../styles/card-library.css";

const searchSchema = z.object({
  q: z.string().max(120).catch(""),
  kind: z.enum(["all", "card", "token", "reference"]).catch("all"),
  outline: z.boolean().catch(false),
});

export const Route = createFileRoute("/cards")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Card library · Local XR" },
      {
        name: "description",
        content:
          "An archived card design preview with local fonts, complete faces and source references.",
      },
    ],
  }),
  component: CardLibrary,
});

function CardLibrary() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = search.q.trim().toLocaleLowerCase();
  const cards = cardProofFixtures.filter(
    (card) =>
      (search.kind === "all" || card.kind === search.kind) &&
      card.faces.some((face) =>
        `${face.name} ${face.typeLine} ${face.oracleText}`.toLocaleLowerCase().includes(query),
      ),
  );
  return (
    <div className="card-design card-library">
      <header className="library-header">
        <Link to="/" className="library-home">
          ← XR playground
        </Link>
        <span className="library-edition">THE CARD STUDIO · DISPLAY PREVIEW</span>
      </header>
      <main className="library-main">
        <div className="library-intro">
          <p className="library-kicker">ARCHIVED STUDIO COLLECTION</p>
          <h1>Card library</h1>
          <p>Explore a small collection of card faces from the printable studio.</p>
        </div>
        <search className="library-filters">
          <label className="library-search">
            Find a card
            <input
              type="search"
              maxLength={120}
              placeholder="Name, type or rules text"
              value={search.q}
              onChange={(event) => {
                void navigate({ search: { ...search, q: event.target.value }, replace: true });
              }}
            />
          </label>
          <label>
            Pieces
            <select
              value={search.kind}
              onChange={(event) => {
                void navigate({
                  search: { ...search, kind: searchSchema.shape.kind.parse(event.target.value) },
                  replace: true,
                });
              }}
            >
              <option value="all">All pieces</option>
              <option value="card">Cards</option>
              <option value="token">Tokens</option>
              <option value="reference">References</option>
            </select>
          </label>
          <label className="library-outline">
            <input
              type="checkbox"
              checked={search.outline}
              onChange={(event) => {
                void navigate({
                  search: { ...search, outline: event.target.checked },
                  replace: true,
                });
              }}
            />
            Outline titles
          </label>
        </search>
        <div className="library-count">
          <span role="status">
            {cards.length} {cards.length === 1 ? "piece" : "pieces"}
          </span>
          <span>All supplied faces stay together</span>
        </div>
        {cards.length > 0 ? (
          <ul className="library-grid" aria-label="Card collection">
            {cards.map((card) => {
              const provenance = cardProofSources[card.id];
              return (
                <li key={card.id} className="library-entry" data-testid="library-entry">
                  <Card card={card} outlineTitle={search.outline} />
                  <div className="library-source">
                    <span>
                      {card.faces.length > 1 ? `${card.faces.length} faces · ` : ""}
                      {card.kind === "card"
                        ? "Card"
                        : card.kind === "token"
                          ? "Token"
                          : "Reference"}
                    </span>
                    {provenance?.sources[0] && (
                      <a href={provenance.sources[0]} target="_blank" rel="noreferrer">
                        Source ↗<span className="library-sr-only"> for {card.faces[0]?.name}</span>
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="library-empty">
            <h2>No matching cards</h2>
            <p>Try another name or show all pieces.</p>
            <button
              type="button"
              onClick={() => {
                void navigate({
                  search: { q: "", kind: "all", outline: search.outline },
                  replace: true,
                });
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        <aside className="library-note" aria-label="About this collection">
          <h2>A design preview</h2>
          <p>
            These archived studio samples include edited display wording and optional reading aids.
            Source links identify their research references; the samples are not a current Oracle
            catalog. This page previews cards rather than running a Commander game.
          </p>
          <p>
            Roboto Condensed and JetBrains Mono are included locally under the SIL Open Font
            License. The symbols come from the studio; no card artwork is used.
          </p>
        </aside>
      </main>
      <footer className="library-footer">
        <span>THE CARD STUDIO · DISPLAY PREVIEW</span>
        <Link to="/">Return to the XR playground →</Link>
      </footer>
    </div>
  );
}
