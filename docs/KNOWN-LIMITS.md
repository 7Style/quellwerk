# Bekannte Grenzen

Was Quellwerk nicht kann, und warum. Jeder Eintrag nennt den Grund, nicht die
Absicht: eine Grenze ohne Grund ist eine Ausrede.

## Keine Website-Quellen

Quellen kommen als Datei oder als eingefügter Text. Eine URL abzurufen, ist
gestrichen.

Der Grund ist der Server, nicht der Aufwand. Quellwerk läuft auf einer Maschine,
die weitere Seiten trägt. Ein Dienst, der eine vom Nutzer gewählte URL abruft,
ist eine serverseitige Anfrageschleuse: er kann interne Adressen erreichen, die
von außen nicht erreichbar sind, Metadaten-Endpunkte der Infrastruktur, andere
Container im selben Netz. Das nennt sich SSRF, und die Abwehr besteht nicht aus
einer Sperrliste privater Bereiche, sondern aus der Auflösung jeder Umleitung,
dem erneuten Prüfen nach jeder davon, einem eigenen Timeout, einem Größenlimit
und dem Verzicht auf DNS-Namen, die zwischen Prüfung und Verbindung ihre Antwort
ändern.

Das ist machbar, aber es ist eine eigene Aufgabe mit eigenen Tests, und ein
Fehler darin trifft nicht Quellwerk, sondern die anderen Seiten auf demselben
Server. In drei Tagen ist der ehrliche Weg, die Funktion wegzulassen, statt sie
halb abzusichern. Wer eine Website als Quelle will, kopiert den Text hinein; das
Ergebnis ist dasselbe, weil ohnehin nur der Text ins Modell geht.

`Source.url` und `Source.kind` bleiben im Schema. Die Spalten kosten nichts und
halten den Weg offen, falls die Funktion auf einer eigenen Maschine nachgereicht
wird.

## Keine Auswahl einzelner Quellen

Jede Antwort arbeitet auf allen fertigen Quellen des Notizbuchs. Die Häkchen in
der Quellenspalte wählen nichts ab.

Der Grund liegt im Cache. Die Dokumente liegen im Nachrichtenteil des Requests
und werden mit einem Breakpoint über eine Stunde zwischengespeichert (ADR-0002,
ADR-0007). Eine Abwahl ändert die Dokumentliste und damit das gecachte Präfix:
der nächste Turn zahlt den vollen Preis für bis zu 150.000 Token statt den
Lesepreis. Der Ausweg, immer alle Dokumente zu senden und die Abwahl nur im
letzten User-Turn mitzuführen, funktioniert, verlagert die Auswahl aber in die
Zuverlässigkeit des Modells: es darf eine abgewählte Quelle nicht mehr benutzen,
und wenn es das doch tut, muss der Resolver die Chips nachträglich verwerfen.

Damit hätte die Oberfläche ein Versprechen gegeben, das die Prüfung erst
hinterher einlöst. Für ein Produkt, dessen einziger Anspruch die nachprüfbare
Herkunft ist, ist das der falsche Tausch. Ohne Auswahl gilt eine einfache,
immer wahre Aussage: die Antwort sah alles, was im Notizbuch liegt.

`Message.selectedSourceIds` bleibt als Spalte im Schema. Sie wird nicht
geschrieben; die Init-Migration ist bereits auf dem Server ausgerollt, und eine
Migration nur zum Entfernen einer leeren Spalte ist mehr Risiko als Gewinn.

## Keine Audio Overview, keine Mind Map

Beide sind gestrichen, nicht verschoben. Drei Tage halten sie nicht neben einem
Chat-Pfad, der stimmen muss, und ein halb gebautes Artefakt kostet mehr
Glaubwürdigkeit als ein fehlendes. `ITtsProvider` bleibt als Interface im
Repository, damit sichtbar ist, wo es angesetzt hätte.

## Ein Notizbuch hängt am Cookie

Es gibt keine Konten (ADR-0005). Ein Notizbuch gehört der anonymen Session, die
es angelegt hat, und ist auf einem anderen Gerät oder nach dem Löschen der
Cookies nicht mehr erreichbar. Für eine Demo ist das der richtige Tausch: kein
Schritt vor der ersten Frage.

## Die Sicherung umfasst die Datenbank, nicht die Dateien

`pg_dump` läuft täglich nach `/var/backups/quellwerk`, sieben Tage
Aufbewahrung. Das Upload-Volume wird nicht gesichert. Der Text jeder Quelle liegt
in Postgres und ist das, worauf jedes Zitat zeigt; die hochgeladene
Originaldatei wird nur zum erneuten Herunterladen gebraucht und ist im Zweifel
wieder hochladbar.

## Nur Deutsch und Englisch werden gemessen

Der Ablehnungssatz ist in beiden Sprachen wörtlich festgelegt und der
Eval-Runner vergleicht genau diese zwei Zeichenketten. Das Modell antwortet auch
in anderen Sprachen, aber deren Ablehnungen zählt keine Metrik.
