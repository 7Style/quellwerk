# ADR-0002: Das ganze Notizbuch in den Kontext, mit Prompt Caching, statt Chunking und Vektorsuche

Status: angenommen
Datum: 2026-09-10

## Kontext
Ein Notizbuch fasst bis zu 50 Quellen und 150.000 Token (docs/SPEC.md). Die Frage ist, ob eine
Antwort auf allen Quellen arbeitet oder auf einer Auswahl, die vorher gesucht wurde. Für die
Zitatprüfung ist das entscheidend: nur was gesendet wurde, kann Offsets zurückliefern.

## Optionen
1. Alles in den Kontext, `cache_control` mit einer Stunde auf dem letzten Dokumentblock. Kostet beim ersten Turn den vollen Preis, danach den Cache-Lesepreis.
2. Chunking mit pgvector: Quellen zerlegen, einbetten, je Frage die besten Abschnitte laden. Kostet eine Embedding-Pipeline, einen Index und eine Relevanz-Entscheidung vor jeder Antwort.
3. Zusammenfassungen statt Volltext. Kostet die Offsets, weil die Zusammenfassung nicht der gespeicherte Text ist.

## Entscheidung
Option 1. Bei 150.000 Token kostet der zweite und jeder weitere Turn nur noch den Cache-Lesepreis,
und die Antwort sieht alles, statt das zu sehen, was ein Retriever für relevant hielt. Genau die
Fälle, die Quellwerk zeigen soll, sind die, an denen Retrieval scheitert: Widersprüche zwischen
Quellen und Fragen über das Notizbuch als Ganzes.

## Konsequenzen
Einfacher: keine Embeddings, kein Index, keine Relevanzstufe, die falsch liegen kann; jedes
Dokument ist zitierbar. Schwerer: die Obergrenze von 150.000 Token ist hart und muss am echten
Request gemessen werden; ein Wechsel von Modell oder Effort verwirft den Cache (ADR-0007).
Zu testen: `cache_read_input_tokens` über null im zweiten Turn, nach einer Änderung an Configure
chat und beim Report direkt nach einem Chat-Turn.

## Verworfen weil
Option 2 verlagert die Qualität in einen Retriever, den diese Demo nicht evaluieren könnte, und
bricht Widerspruchsfragen: der Retriever liefert typischerweise die ähnlichsten Abschnitte, nicht
die einander widersprechenden. Option 3 zerstört die Zeichen-Offsets, auf denen ADR-0001 steht.

## Würde sich ändern, wenn
Notizbücher regelmäßig über 150.000 Token gehen, oder wenn der Cache-Lesepreis so steigt, dass
Retrieval trotz seines Qualitätsverlusts günstiger wird.
