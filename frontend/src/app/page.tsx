/**
 * Home. The notebook grid arrives in M4-T1; until then this route only has to
 * exist and must not redirect anywhere, because the template's login page is
 * gone.
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-h1 font-semibold">Quellwerk</h1>
      <p className="text-ink-muted mt-2 max-w-prose">
        Ask questions about documents you added yourself. Every sentence in an answer carries the
        passage it came from.
      </p>
    </main>
  );
}
