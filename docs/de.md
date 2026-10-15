# motionEye

Bringt die Kameras eines [motionEye](https://github.com/motioneye-project/motioneye)-Servers
(motionEye auf einem Raspberry Pi, einem NAS oder in Docker, motionEyeOS) in Gladys: ihr Bild, die
Bewegung, die sie gerade sehen, und die Schalter von motionEye für Bewegungserkennung, Fotoaufnahme
und Videoaufnahme. Eine Bewegung löst eine Szene mit einem frischen Bild aus, damit eine Szene es
dir schicken kann.

Getestet mit echten motionEye-Servern in Docker (0.42 und 0.45 in Entwicklung) und einer simulierten
Netzwerkkamera, noch nicht auf einem Raspberry Pi mit motionEyeOS: Rückmeldungen sind willkommen
auf [GitHub](https://github.com/guim31/gladys-motioneye/issues) oder im Gladys-Forum.

## Was du brauchst

- Gladys 5.1 oder neuer.
- Einen motionEye-Server, den Gladys im lokalen Netz erreicht, Version 0.42 oder neuer. Seine
  Weboberfläche liegt meist unter `http://<Adresse>:8765`.
- Das **Administratorkonto** von motionEye (Benutzer `admin` als Standard, der die Einstellungen
  öffnet). Der Überwachungsbenutzer sieht nur die Bilder: Er kann keinen Schalter ändern.
- Einen motionEye-Server pro Integration. Kameras anderer motionEye-Server lassen sich diesem als
  „entfernte motionEye-Kamera“ hinzufügen und kommen dann mit ihm in Gladys.

## Einrichtung

1. Öffne in Gladys **Integrationen**, suche **motionEye** und installiere es.
2. Fülle im Tab **Konfiguration** aus:
   - **motionEye-Adresse**: die Adresse der motionEye-Seite, z. B. `192.168.1.20:8765`. Ohne
     Angabe wird Port 8765 verwendet; schreibe `https://` oder einen Pfad
     (`http://nas.lan:80/motioneye`) für einen Reverse-Proxy.
   - **Administrator-Benutzername** (`admin` als Standard) und **Passwort**.
   - **Bewegungsprüfung**: wie oft jede in Gladys hinzugefügte Kamera gelesen wird (2, 5, 10 oder
     30 Sekunden, Standard 5). Das ist die Verzögerung, bis Bewegung erkannt wird.
   - **Bildaktualisierung**: wie oft jedes Bild an Gladys gesendet wird (10 Sekunden bis 15
     Minuten, Standard 1 Minute). Eine Bewegung sendet sofort ein neues.
   - **Sprache der Namen**: die Sprache der Funktionsnamen (Standard Französisch), die beim
     Hinzufügen einer Kamera vergeben werden.
3. Speichere und öffne dann den Tab **Entdecken**: ein Gerät pro motionEye-Kamera. Füge die
   gewünschten hinzu.
4. Die Schaltfläche **Verbindung prüfen** im Tab Konfiguration listet die Kameras von motionEye auf,
   ob sie antworten und ob ihre Bewegungserkennung an ist.

## Die Gladys-Geräte

Jede motionEye-Kamera wird eine Gladys-Kamera mit dem Namen aus motionEye, mit:

| Funktion           | Was es ist                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Bild               | Das Kamerabild, für die Kamerabox des Dashboards und die Szenenaktion „Kameraaufnahme senden“.                            |
| Bewegung           | Die Bewegung, die motionEye gerade sieht (erkannt / nichts), wenn die Bewegungserkennung an ist.                          |
| Bewegungserkennung | Schalter: die Bewegungserkennung der Kamera in motionEye.                                                                 |
| Fotoaufnahme       | Schalter: die Fotos der Kamera in motionEye (aufgenommen im in motionEye gewählten Modus: bei Bewegung, in Intervallen…). |
| Videoaufnahme      | Schalter: die Videos der Kamera in motionEye (aufgenommen im in motionEye gewählten Modus: bei Bewegung, durchgehend…).   |

Die Schalter folgen der motionEye-Seite: Eine Änderung dort erreicht Gladys innerhalb einer Minute.
Eine Kamera, die nicht mehr antwortet, wird auf ihrer Gerätekarte als nicht erreichbar angezeigt.

**Das Ändern eines Schalters startet die motionEye-Kameras für einige Sekunden neu** (motionEye
startet seinen `motion`-Prozess nach jeder Änderung der Einstellungen neu): Die Bilder pausieren in
dieser Zeit.

## Dashboard-Widget

**motionEye-Kamera** (Widget-Einstellung: die Kamera) zeigt das Bild mit seiner Uhrzeit, ob Bewegung
gesehen wird, ob Bewegungserkennung und Videoaufnahme an sind, und zwei Schaltflächen: Eine schaltet
die Bewegungserkennung ein oder aus, die andere lässt motionEye ein Foto speichern und holt die neue
Ansicht.

## Szenen

### Auslöser

- **motionEye: Bewegung erkannt**: Eine Kamera beginnt, Bewegung zu sehen (Bewegungserkennung in
  motionEye an). Wähle eine Kamera oder lass das Feld für alle Kameras leer. Das Kamerabild wird sofort an
  Gladys gesendet: Eine Aktion „Kameraaufnahme senden“ direkt danach sendet den Moment der
  Erkennung. Der Kameraname wird an die Aktionen weitergegeben.
- **motionEye: Kamera offline**: Eine Kamera antwortet nicht mehr (motionEye bekommt kein Bild mehr
  von ihr, oder motionEye selbst ist aus), nach drei fehlgeschlagenen Lesungen in Folge. Gleiche
  Kamerawahl.

### Aktionen

- **motionEye: Bewegungserkennung**: schaltet die Bewegungserkennung ein oder aus, für eine Kamera
  oder für alle zugleich, wenn die Kamera leer bleibt (ein einziger Neustart von motionEye). Gibt
  die Zahl der geänderten Kameras zurück.
- **motionEye: Foto aufnehmen**: motionEye speichert ein Foto bei seinen Medien, und Gladys erhält
  das neue Bild (für „Kameraaufnahme senden“).
- **motionEye: Kamera abfragen**: liest eine Kamera jetzt. Gibt zurück, ob sie antwortet (online),
  Bewegung sieht und ob Bewegungserkennung, Fotoaufnahme und Videoaufnahme an sind, für eine
  Bedingung der nächsten Schritte.

### Szenen-Ideen

- **Alarm scharf**: Wenn die Alarmanlage des Hauses scharf geschaltet wird, „motionEye:
  Bewegungserkennung“ An, für alle Kameras; Aus, wenn sie unscharf geschaltet wird.
- **Bewegung am Eingang**: Auslöser „motionEye: Bewegung erkannt“ auf der Eingangskamera, dann
  „Kameraaufnahme senden“ dieser Kamera an dein Handy.
- **Kamera verloren**: Auslöser „motionEye: Kamera offline“, dann eine Nachricht „{Kameraname}
  antwortet nicht mehr“.

## Fehlerbehebung

- **„motionEye lehnt Benutzername oder Passwort ab“**: Gib das Administratorkonto ein (das die
  Einstellungen von motionEye öffnet), nicht den Überwachungsbenutzer.
- **„motionEye antwortet unter dieser Adresse nicht“**: Öffne die Adresse in einem Browser im Netz
  von Gladys; prüfe den Port (Standard 8765) und dass motionEye im Netz lauscht, nicht nur auf
  `localhost`.
- **Eine Kamera ist nicht erreichbar**: motionEye hat auch kein Bild von ihr; prüfe sie auf der
  motionEye-Seite.
- **„Bewegung“ ändert sich nie**: Die Erkennung muss an sein (Schalter **Bewegungserkennung**), und
  motionEye muss die Bewegung selbst erkennen (Schwelle, Maske… in seinen Einstellungen).
- **Protokolle**: Die Integration protokolliert nur ihren Lebenslauf (Start, Server oder Kamera
  verloren und zurück, Aktionen); setze `LOG_LEVEL=debug` für die Integration, um jede Lesung zu
  sehen.

## Grenzen

- Die Bewegung wird alle paar Sekunden gelesen (Einstellung **Bewegungsprüfung**): Eine kürzere
  Bewegung, die auch kürzer als das motionEye-Ereignis ist, kann verpasst werden. motionEye kann
  Gladys nicht direkt benachrichtigen: Seine Webhooks bräuchten einen im Netz offenen Port der
  Integration.
- Ein motionEye-Server pro Integration (die anderen als entfernte Kameras, siehe oben).
- „Einfache MJPEG“-Kameras von motionEye werden ausgelassen: motionEye leitet nur ihren Stream
  weiter, ohne Erkennung oder Einstellungen.
- Das Bild in Gladys ist kein Live-Stream: Es wird im gewählten Takt aktualisiert, und sofort bei
  Bewegung.
- Fotos und Videos bleiben in motionEye; Gladys zeigt nur das letzte Bild.
