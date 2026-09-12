import type { Metadata } from 'next';
import Link from 'next/link';

import { APP_NAME } from '@/lib/app';

/**
 * Die Datenschutzseite (SECURITY.md 7.6, docs/SPEC.md).
 *
 * Deutsch, wie README, ADRs und SPEC: sie richtet sich an einen Besucher dieses
 * Servers und nicht an einen Leser des Codes.
 *
 * Sie sagt, was der Code heute tut, und nicht, was der Plan vorsieht. Die
 * automatische Löschung nach sieben Tagen ist die eine Stelle, an der das
 * auseinandergeht: die Regel steht in SPEC.md, der Aufräumer ist nicht gebaut.
 * Also steht hier, dass er nicht läuft. Eine Datenschutzerklärung, die eine
 * Löschung verspricht, die kein Job ausführt, ist die eine Art Text, die man
 * nicht "schon fast richtig" schreiben darf.
 *
 * `noindex` auf dieser Seite, `Disallow: /` in der robots.txt. Der
 * `X-Robots-Tag` für die ganze Anwendung kommt mit M7-T3.
 */
export const metadata: Metadata = {
  // Der Titel trägt den konfigurierten Namen, der Text der Seite den festen:
  // APP_NAME ist in diesem Build "quellwerk", und ein kleingeschriebener
  // Satzanfang in deutscher Prosa liest sich wie ein Tippfehler.
  title: `Datenschutz - ${APP_NAME}`,
  robots: { index: false, follow: false },
};

/** Ein Abschnitt der Seite. Überschrift, Absätze, nichts weiter. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="m-0 mt-4 font-ui text-h3 font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
    </section>
  );
}

export default function DatenschutzPage() {
  return (
    // Eigener Scrollbereich, wie auf den beiden anderen Routen: `html, body`
    // tragen `overflow: hidden`, damit die Anwendung selbst nie scrollt und
    // jede Spalte ihre eigene Leiste hat (styles/global.css). Ohne diesen
    // Rahmen wäre diese Seite unterhalb des ersten Bildschirms nicht lesbar -
    // aufgefallen im Screenshot, nicht im Test.
    <div className="h-dvh overflow-y-auto" data-testid="scroll-datenschutz">
      <main className="mx-auto grid max-w-[68ch] gap-3 px-5 py-10 font-read text-read leading-read">
        <p className="m-0">
          <Link href="/" className="font-ui text-ui text-ink-muted no-underline hover:underline">
            Zurück zu Quellwerk
          </Link>
        </p>

        <h1 className="m-0 mt-2 font-ui text-h1 font-semibold tracking-[-0.015em]">Datenschutz</h1>

        <p className="m-0 text-ink-muted">
          Stand: 12. September 2026. Diese Seite beschreibt, was diese Installation tatsächlich
          speichert und weitergibt. Wo der Plan weiter ist als der Code, steht der Code.
        </p>

        <Section title="Zweck">
          <p className="m-0">
            Quellwerk ist eine Demo, die ich für eine Bewerbung gebaut habe. Es ist kein Produkt und
            kein Dienst: es gibt keine Konten, keine Werbung, keine Analyse-Werkzeuge, keine
            Weitergabe an Dritte zu eigenen Zwecken und keinen Newsletter. Wer die Seite benutzt,
            probiert eine Arbeitsprobe aus.
          </p>
        </Section>

        <Section title="Was gespeichert wird">
          <p className="m-0">
            Ein Notizbuch entsteht, wenn Sie eines anlegen. Darin wird gespeichert:
          </p>
          <ul className="m-0 grid list-disc gap-1 pl-6">
            <li>
              Der Text Ihrer Quellen. Eine hochgeladene Datei wird beim Einlesen in Text
              umgewandelt; die Datei selbst wird danach vom Server gelöscht, weil nur der Text an
              das Modell geht und im Dokument angezeigt wird.
            </li>
            <li>
              Ihre Fragen und die Antworten darauf, in Ihren eigenen Notizbüchern. Im Demo-Notizbuch
              nicht: dort wird kein Turn gespeichert, weil es allen gehört.
            </li>
            <li>Die von Ihnen bestellten Reports, mit dem Prompt, aus dem sie entstanden sind.</li>
            <li>
              Zu jedem Modellaufruf eine Zeile mit Modell, Token-Zahlen, Kosten und Dauer. Kein
              Quelltext, keine Frage und keine Antwort stehen darin; sie dient dem Tagesbudget.
            </li>
          </ul>
        </Section>

        <Section title="Das Cookie">
          <p className="m-0">
            Ein technisch notwendiges Cookie, ohne das die Seite nicht funktioniert, und deshalb
            ohne Banner. Es enthält eine zufällige Sitzungskennung und das Datum, an dem die Sitzung
            begann - keinen Namen, keine Adresse, kein Profil. Diese Kennung ist alles, woran Ihre
            Notizbücher hängen: es gibt keine Anmeldung, und wer das Cookie verliert, verliert den
            Zugang zu seinen Notizbüchern. Es läuft nach dreißig Tagen ab.
          </p>
        </Section>

        <Section title="Wo die Daten liegen">
          <p className="m-0">
            Auf einem Server, den ich selbst betreibe, in einem Rechenzentrum in Deutschland.
            Datenbank, Warteschlangen und Dateien liegen dort in Containern, die von außen nicht
            erreichbar sind; erreichbar ist nur der Webserver davor, über HTTPS. Es gibt keinen
            Cloud-Speicher und keine Analyse-Dienste.
          </p>
        </Section>

        <Section title="Wer die Daten außerdem verarbeitet">
          <p className="m-0">
            Ein einziger Dienst außerhalb dieses Servers: Anthropic, für die Modellaufrufe. Dorthin
            gehen die Quellen des Notizbuchs, Ihre Frage und der bisherige Verlauf desselben
            Notizbuchs - das ist es, woraus eine Antwort entsteht. Nicht dorthin gehen Ihre
            IP-Adresse, Ihr Cookie und Ihre Sitzungskennung: der Aufruf geht vom Server aus, nicht
            von Ihrem Browser.
          </p>
          <p className="m-0">
            Anthropic verarbeitet das als Auftragsverarbeiter unter einem Vertrag zur
            Auftragsverarbeitung mit EU-Standardvertragsklauseln, trainiert keine Modelle mit Daten
            aus der API und löscht sie innerhalb von dreißig Tagen. Wenn Sie das nicht möchten,
            benutzen Sie die Seite nicht: ohne diesen Aufruf gibt es keine Antwort.
          </p>
        </Section>

        <Section title="Logs">
          <p className="m-0">
            Der Webserver und die Anwendung schreiben Zugriffe mit: Zeitpunkt, Methode, Pfad ohne
            Query, Statuscode, Browserkennung und IP-Adresse. Quelltexte, Fragen, Antworten und
            Zitate stehen nicht in den Logs, und eine Fehlermeldung aus einer Bibliothek wird auf
            Klasse und Status gekürzt, bevor sie geschrieben wird - genau deshalb, weil so eine
            Meldung den Inhalt eines Dokuments zitieren kann.
          </p>
        </Section>

        <Section title="Löschung">
          <p className="m-0">
            Vorgesehen ist, dass ein Notizbuch, das sieben Tage nicht benutzt wurde, samt Quellen,
            Nachrichten und Reports gelöscht wird. Der Aufräumer, der das automatisch tut, ist noch
            nicht gebaut, und solange das so ist, steht hier nicht das Gegenteil: gelöscht wird
            derzeit auf Zuruf und von Hand. Schreiben Sie mir, und ich lösche Ihr Notizbuch - oder
            fügen Sie einfach nichts ein, was Sie nicht auf einem fremden Server haben wollen. Das
            ist der ehrlichere Rat.
          </p>
          <p className="m-0">
            Eine Funktion, mit der Sie ein Notizbuch selbst löschen, gibt es in dieser Fassung noch
            nicht. Das Demo-Notizbuch können Sie nur lesen; darin entsteht nichts, was zu löschen
            wäre.
          </p>
        </Section>

        <Section title="Ihre Rechte">
          <p className="m-0">
            Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und
            Beschwerde bei einer Aufsichtsbehörde. Da es keine Konten gibt, brauche ich für eine
            Auskunft die Kennung aus Ihrem Cookie - ohne sie kann ich Ihre Notizbücher nicht von
            fremden unterscheiden, was gleichzeitig der Grund ist, warum das niemand anderes kann.
          </p>
        </Section>

        <Section title="Verantwortlicher">
          <p className="m-0">
            Ersin Keser, Betreiber von 7style.net. Die Kontaktdaten stehen im Impressum unter{' '}
            <a href="https://7style.net" className="text-ink">
              7style.net
            </a>
            .
          </p>
        </Section>

        <p className="m-0 mt-4 text-small text-ink-faint">
          Was diese Installation darüber hinaus bewusst nicht kann, steht im Repository in
          docs/KNOWN-LIMITS.md.
        </p>
      </main>
    </div>
  );
}
