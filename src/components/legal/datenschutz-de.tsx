import { A, Box, P, Section, Sub, Table, UL } from "@/components/legal/legal-page";
import { OPERATOR, SERVICES } from "@/components/legal/operator";

export const DATENSCHUTZ_TOC_DE = [
  { id: "verantwortlicher", title: "Verantwortlicher und Geltungsbereich" },
  { id: "ueberblick", title: "Das Wichtigste in Kürze" },
  { id: "begriffe", title: "Rechtsgrundlagen" },
  { id: "hosting", title: "Hosting, Server-Logfiles und Sicherheit" },
  { id: "cookies", title: "Cookies und lokale Speicherung (§ 25 TDDDG)" },
  { id: "konto", title: "Tretu-Konto (auth.tretu.de)" },
  { id: "hub", title: "tretu.de: Website, Anmeldung und Plattform" },
  { id: "einbindungen", title: "Eingebettete Inhalte Dritter" },
  { id: "saga", title: "Saga" },
  { id: "play", title: "Tretu Play" },
  { id: "hollowmere", title: "Hollowmere" },
  { id: "minecraft", title: "Minecraft-Server und Dashboard" },
  { id: "teamspeak-discord", title: "TeamSpeak, Discord und soziale Netzwerke" },
  { id: "game-server", title: "Game-Server-Dashboard (Team)" },
  { id: "email", title: "E-Mail-Versand und Kontakt" },
  { id: "zahlungen", title: "Zahlungen und Tretu-Credits" },
  { id: "statistik", title: "Statistik und Statusseite" },
  { id: "empfaenger", title: "Empfänger und Auftragsverarbeiter" },
  { id: "drittland", title: "Übermittlung in Drittländer" },
  { id: "speicherdauer", title: "Speicherdauer" },
  { id: "rechte", title: "Deine Rechte" },
  { id: "widerspruch", title: "Widerspruchsrecht" },
  { id: "sonstiges", title: "Pflicht zur Bereitstellung, automatisierte Entscheidungen, Minderjährige" },
  { id: "aenderungen", title: "Änderungen dieser Datenschutzerklärung" },
];

export function DatenschutzDe() {
  return (
    <>
      <Section id="verantwortlicher" title="1. Verantwortlicher und Geltungsbereich">
        <P>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</P>
        <P>
          <strong className="text-foreground">{OPERATOR.company}</strong>
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.zip} {OPERATOR.city}, {OPERATOR.country.de}
          <br />
          Telefon: {OPERATOR.phone}
          <br />
          E-Mail: {OPERATOR.emailObfuscated}
          <br />
          Vertreten durch die Geschäftsführer {OPERATOR.managingDirectors}. Weitere Angaben findest du im{" "}
          <A href="/impressum">Impressum</A>.
        </P>
        <P>
          {OPERATOR.brand} ist eine Marke der {OPERATOR.company}. Diese Datenschutzerklärung gilt für alle Dienste der Marke{" "}
          {OPERATOR.brand}:
        </P>
        <UL>
          <li>die Community-Website und Plattform {SERVICES.hub} (einschließlich internem Game-Server-Dashboard),</li>
          <li>das zentrale Tretu-Konto unter {SERVICES.auth},</li>
          <li>das KI-Rollenspiel Saga unter {SERVICES.saga},</li>
          <li>die Browser-Spielesammlung Tretu Play unter {SERVICES.play},</li>
          <li>das Spiel Hollowmere (Website {SERVICES.hollowmere}, Web-Version und Desktop-Apps),</li>
          <li>den Tretu-Minecraft-Server und sein Dashboard unter {SERVICES.minecraft},</li>
          <li>die Statusseite unserer Dienste ({SERVICES.status}),</li>
          <li>unsere Community-Server auf TeamSpeak und Discord sowie unsere Profile in sozialen Netzwerken.</li>
        </UL>
        <P>
          Wenn wir in dieser Erklärung von „wir“ oder „uns“ sprechen, meinen wir die {OPERATOR.company}. Für Datenschutzanfragen
          erreichst du uns über die oben genannten Kontaktdaten.
        </P>
      </Section>

      <Section id="ueberblick" title="2. Das Wichtigste in Kürze">
        <UL>
          <li>Wir verkaufen keine Daten, zeigen keine Werbung und verfolgen dich nicht über fremde Websites hinweg.</li>
          <li>
            Unsere Server stehen bei Hetzner in Deutschland. Analyse- oder Tracking-Dienste setzen wir nicht ein; nur Tretu Play
            zählt Seitenaufrufe mit einer eigenen Statistik ohne Cookies, die nur Tagessummen speichert.
          </li>
          <li>
            Wir setzen nur technisch notwendige Cookies und Speichereinträge ein. Inhalte von Twitch, Discord und TSViewer laden
            erst, wenn du sie anklickst.
          </li>
          <li>
            Mit einem Tretu-Konto meldest du dich bei allen Diensten an. Die Dienste erhalten dabei nur die Angaben, die sie für
            ihre Funktion brauchen.
          </li>
          <li>
            Einige Funktionen nutzen externe Anbieter, etwa KI-Dienste in Saga, Stripe für Zahlungen oder Amazon SES für
            System-E-Mails. Welche Daten dorthin gehen, steht im jeweiligen Abschnitt.
          </li>
        </UL>
      </Section>

      <Section id="begriffe" title="3. Rechtsgrundlagen">
        <P>Wir verarbeiten personenbezogene Daten nur, wenn eine der folgenden Rechtsgrundlagen greift:</P>
        <UL>
          <li>
            <strong className="text-foreground">Vertrag (Art. 6 Abs. 1 lit. b DSGVO)</strong> – um dir die Dienste bereitzustellen,
            die du nutzt (z. B. Konto, Spiele, Plattform-Funktionen, Credits), und um vorvertragliche Anfragen zu beantworten.
          </li>
          <li>
            <strong className="text-foreground">Rechtliche Pflicht (Art. 6 Abs. 1 lit. c DSGVO)</strong> – etwa handels- und
            steuerrechtliche Aufbewahrungspflichten oder Auskunftspflichten gegenüber Behörden.
          </li>
          <li>
            <strong className="text-foreground">Berechtigte Interessen (Art. 6 Abs. 1 lit. f DSGVO)</strong> – um unsere Dienste
            sicher, stabil und missbrauchsfrei zu betreiben, sie zu verbessern und mit der Community zu kommunizieren. Unser
            Interesse nennen wir jeweils im Abschnitt.
          </li>
          <li>
            <strong className="text-foreground">Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG)</strong> – wenn du uns
            ausdrücklich eine Einwilligung gibst, etwa für Push-Benachrichtigungen, Spielstatistiken in Hollowmere oder das Laden
            eingebetteter Inhalte. Eine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3
            DSGVO).
          </li>
        </UL>
        <P>
          Besondere Kategorien personenbezogener Daten (Art. 9 DSGVO) fragen wir nicht ab. Bitte gib solche Angaben auch nicht
          in Freitexten, Chats oder KI-Eingaben ein.
        </P>
      </Section>

      <Section id="hosting" title="4. Hosting, Server-Logfiles und Sicherheit">
        <Sub title="Hosting">
          <P>
            Alle Dienste laufen auf Servern, die wir bei der Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen,
            Deutschland, betreiben. Die Server für Websites, Datenbanken, Tretu-Konto und Spiele-Backends stehen in
            Rechenzentren in Deutschland. Hetzner verarbeitet die Daten als Auftragsverarbeiter in unserem Auftrag (Art. 28
            DSGVO). Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren, wirtschaftlichen Betrieb (Art. 6 Abs. 1
            lit. f DSGVO) bzw. die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO).
          </P>
          <P>
            Einzelne Spielserver, die das Team über das Game-Server-Dashboard startet, laufen auf eigenen virtuellen Maschinen bei
            Hetzner. Ihr Standort wird beim Anlegen gewählt und ist in der Regel Deutschland; Hetzner betreibt aber auch
            Rechenzentren in Finnland, den USA und Singapur. Wenn du dich mit einem Spielserver verbindest, verarbeitet dieser
            deine IP-Adresse und die Daten, die das jeweilige Spiel überträgt (z. B. Spielername).
          </P>
        </Sub>
        <Sub title="Server-Logfiles">
          <P>
            Bei jedem Aufruf unserer Websites und Schnittstellen verarbeitet der Webserver (nginx) automatisch: IP-Adresse,
            Datum und Uhrzeit, aufgerufene Adresse, HTTP-Statuscode, übertragene Datenmenge, die zuvor besuchte Seite (Referrer)
            sowie Browser und Betriebssystem (User-Agent). Wir benötigen diese Daten, um die Seiten auszuliefern, Fehler zu
            finden und Angriffe abzuwehren (Art. 6 Abs. 1 lit. f DSGVO). Die Logfiles werden nach spätestens 7 Tagen gelöscht,
            soweit wir sie nicht ausnahmsweise zur Aufklärung eines konkreten Sicherheitsvorfalls länger benötigen.
          </P>
        </Sub>
        <Sub title="DNS und Netzwerk: Cloudflare">
          <P>
            Die DNS-Einträge unserer Domains, darunter die Adressen der Spielserver, verwalten wir bei Cloudflare, Inc., 101
            Townsend St., San Francisco, CA 94107, USA. Damit dein Gerät unsere Server findet, fragt es die Nameserver von
            Cloudflare ab; dabei verarbeitet Cloudflare die IP-Adresse des anfragenden DNS-Resolvers (meist deines
            Internetanbieters) und den abgefragten Namen. Soweit einzelne Adressen über das Netzwerk von Cloudflare geleitet
            werden, verarbeitet Cloudflare dabei auch die Verbindungsdaten (IP-Adresse, aufgerufene Adresse, technische Angaben
            deines Browsers), um die Verbindung zuzustellen und vor Angriffen zu schützen. Rechtsgrundlage ist unser berechtigtes
            Interesse an einer zuverlässigen und sicheren Erreichbarkeit (Art. 6 Abs. 1 lit. f DSGVO). Zur Übermittlung in die
            USA siehe <A href="#drittland">Abschnitt 19</A>.
          </P>
        </Sub>
        <Sub title="Sicherheit">
          <P>
            Wir übertragen alle Daten verschlüsselt (TLS). Passwörter speichern wir nur als sicheren Hash, Zugangstoken für
            Drittdienste verschlüsselt. Zugriff auf Server und Datenbanken haben nur wenige berechtigte Personen. Zum Schutz vor
            Missbrauch begrenzen wir zum Beispiel die Anzahl von Anmeldeversuchen.
          </P>
        </Sub>
      </Section>

      <Section id="cookies" title="5. Cookies und lokale Speicherung (§ 25 TDDDG)">
        <P>
          Wir speichern Informationen auf deinem Gerät oder lesen sie aus, ausschließlich soweit dies unbedingt erforderlich ist,
          um den von dir ausdrücklich gewünschten Dienst bereitzustellen (§ 25 Abs. 2 Nr. 2 TDDDG). Dafür ist keine Einwilligung
          nötig. Wir verwenden keine Werbe-, Tracking- oder Analyse-Cookies. Die anschließende Verarbeitung der Daten stützen wir
          auf Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO.
        </P>
        <Table
          head={["Speichereintrag", "Zweck", "Dauer"]}
          rows={[
            [
              "Sitzungs-Cookie (z. B. tretu.session_token)",
              "Hält dich nach der Anmeldung angemeldet (alle Dienste mit Konto).",
              "bis zur Abmeldung, höchstens 30 Tage",
            ],
            [
              "Kurzlebige Anmelde-Cookies",
              "Schützen den Anmeldevorgang über das Tretu-Konto, Discord, Google oder Apple vor Fälschung (CSRF, PKCE).",
              "einige Minuten",
            ],
            ["NEXT_LOCALE, NEXT_LOCALE_MANUAL", "Merken sich die gewählte Sprache.", "1 Jahr"],
            ["theme (lokaler Speicher)", "Merkt sich hell/dunkel.", "bis du ihn löschst"],
            [
              "tretu-embeds (lokaler Speicher)",
              "Merkt sich, welche eingebetteten Inhalte (Twitch, Discord, TSViewer) immer geladen werden sollen – nur wenn du „immer laden“ wählst.",
              "bis du ihn löschst",
            ],
            [
              "Weitere Einstellungen (lokaler Speicher)",
              "z. B. TRT-Avatare auf tretu.de, Ton- und Vorleseeinstellungen in Play und Saga, lokale Spielstände und Einstellungen in Hollowmere.",
              "bis du sie löschst",
            ],
          ]}
        />
        <P>
          Inhalte von Drittanbietern, die selbst Cookies setzen können (Twitch, Discord-Widget, TSViewer), laden wir erst, wenn
          du auf „laden“ klickst. Dieser Klick ist deine Einwilligung nach § 25 Abs. 1 TDDDG und Art. 6 Abs. 1 lit. a DSGVO; du
          kannst sie widerrufen, indem du den Eintrag „tretu-embeds“ bzw. die Website-Daten in deinem Browser löschst. Du kannst
          Cookies und lokalen Speicher jederzeit in deinem Browser einsehen und löschen; ohne Sitzungs-Cookie ist eine Anmeldung
          allerdings nicht möglich.
        </P>
      </Section>

      <Section id="konto" title="6. Tretu-Konto (auth.tretu.de)">
        <P>
          Das Tretu-Konto ist unser zentrales Konto für alle Dienste („Single Sign-on“). Es wird unter {SERVICES.auth} verwaltet;
          die Seite „Mein Konto“ erreichst du unter <A href="https://auth.tretu.de/konto">auth.tretu.de/konto</A>.
        </P>
        <Sub title="Welche Daten wir verarbeiten">
          <UL>
            <li>
              Kontodaten: eine dauerhafte Tretu-ID, Benutzername, Anzeigename, E-Mail-Adresse und deren Bestätigungsstatus,
              Profilbild (optional), Sprache sowie – falls du dich mit Passwort anmeldest – dein Passwort als sicherer Hash.
            </li>
            <li>
              Verknüpfte Konten, wenn du sie verbindest: Discord-ID, Minecraft-UUID und -Name, Steam-ID sowie Anmeldungen über
              externe Anbieter (siehe unten).
            </li>
            <li>Rollen, etwa „Admin“ für Team-Mitglieder.</li>
            <li>
              Sitzungen und Sicherheitsdaten: angemeldete Geräte mit IP-Adresse, Browser-Kennung und Zeitpunkt, Bestätigungs-
              und Zurücksetzungs-Codes.
            </li>
          </UL>
        </Sub>
        <Sub title="Anmeldung bei unseren Diensten">
          <P>
            Wenn du dich bei einem Tretu-Dienst „Mit Tretu-Konto anmelden“ entscheidest, übermittelt das Tretu-Konto dem
            jeweiligen Dienst (z. B. Saga oder Play) per OpenID Connect deine Tretu-ID, Benutzername, Anzeigename, Profilbild,
            E-Mail-Adresse samt Bestätigungsstatus, Sprache, Rollen und die IDs verknüpfter Konten. Der Dienst gleicht dich darüber
            mit einem vorhandenen Konto ab (über die Tretu-ID, die Kennung deines alten Kontos bei diesem Dienst aus der
            Übernahme der bisherigen Konten, die Discord-ID oder eine auf beiden Seiten bestätigte E-Mail-Adresse) oder legt ein
            neues an. Änderungen an deinem Tretu-Konto (z. B. Name, Sprache oder Löschung) geben wir an die Dienste weiter, damit
            sie aktuell bleiben bzw. deine Daten dort ebenfalls löschen oder anonymisieren.
          </P>
          <P>
            Rechtsgrundlage ist die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO); Sicherheitsdaten verarbeiten wir
            zur Abwehr von Missbrauch (Art. 6 Abs. 1 lit. f DSGVO).
          </P>
        </Sub>
        <Sub title="Anmeldung über Discord, Google oder Apple">
          <P>
            Soweit wir die Anmeldung über Discord (Discord Inc., 444 De Haro Street, Suite 200, San Francisco, CA 94107, USA),
            Google (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland) oder Apple (Apple Distribution
            International Ltd., Hollyhill Industrial Estate, Hollyhill, Cork, Irland) anbieten und du sie wählst, wirst du zum
            jeweiligen Anbieter weitergeleitet. Wir erhalten von dort eine Konto-Kennung, deinen Namen, gegebenenfalls deine
            E-Mail-Adresse und dein Profilbild und nutzen diese Daten nur zur Anmeldung und Darstellung deines Profils. Wir
            veröffentlichen nichts in deinem Namen. Für die Verarbeitung beim Anbieter gelten dessen Datenschutzbestimmungen;
            dabei kann eine Übermittlung in die USA stattfinden. Profilbilder dieser Anbieter laden manche Dienste direkt von deren
            Servern, wodurch die IP-Adresse des Betrachters an den Anbieter übermittelt wird.
          </P>
        </Sub>
      </Section>

      <Section id="hub" title="7. tretu.de: Website, Anmeldung und Plattform">
        <Sub title="Website">
          <P>
            Beim Besuch von {SERVICES.hub} verarbeiten wir die in Abschnitt 4 genannten Logdaten. Die Video-Übersicht lädt unser
            Server aus dem öffentlichen YouTube-Feed des Tretu-Kanals; Vorschaubilder liefert unser Server aus, sodass dein
            Browser beim Anzeigen der Liste keine Verbindung zu YouTube aufbaut. Die Minecraft-Karte (map.tretu.de) betreiben wir
            selbst; sie zeigt die Welt und die Positionen der Spieler, die gerade online sind.
          </P>
        </Sub>
        <Sub title="Anmeldung auf tretu.de">
          <P>
            Auf tretu.de meldest du dich ausschließlich mit deinem Tretu-Konto an. Wir speichern dazu ein lokales
            Nutzerprofil (Anzeigename, Profilbild, Discord-ID, Tretu-ID, E-Mail-Adresse, Sprache), deine Rollen, die
            Verknüpfung zum Tretu-Konto samt der von ihm ausgestellten Tokens sowie deine Sitzungen (mit IP-Adresse und
            Browser-Kennung). Verknüpfungen aus der früheren direkten Anmeldung mit Discord bewahren wir vorerst auf, nutzen sie
            aber nicht mehr; wir löschen sie, sobald wir sie für eine mögliche Rückkehr zur Vorversion nicht mehr brauchen. Bei jeder Anmeldung aktualisieren wir Name und Profilbild und den Zeitpunkt der letzten Anmeldung.
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
          </P>
        </Sub>
        <Sub title="Plattform: Profile, Abzeichen, Freunde, Anwesenheit, Benachrichtigungen, Credits">
          <P>
            Die Tretu-Plattform verbindet unsere Dienste. Dazu verarbeiten wir, jeweils mit deiner Tretu-ID verknüpft:
          </P>
          <UL>
            <li>
              Profil: Benutzername, Anzeigename, Profilbild, Level und Erfahrungspunkte, Abzeichen und Statistiken. Dein Profil ist
              unter tretu.de/u/&lt;Benutzername&gt; öffentlich sichtbar.
            </li>
            <li>
              Spielereignisse, die unsere Dienste melden, etwa beendete Partien mit Ergebnis, Spielmodus, Dauer und Mitspielern,
              gespielte Runden, erstellte Welten oder Charaktere, freigeschaltete Erfolge und Spielminuten. Daraus berechnen wir
              Statistiken, Level und Abzeichen.
            </li>
            <li>Freundschaften, Freundschaftsanfragen und Einladungen zu Spielen.</li>
            <li>
              Anwesenheit: ob du gerade online bist oder spielst, in welchem Dienst, was du gerade spielst und ein Link zum
              Mitspielen. Freunde sehen diese Angaben; sie verfallen zwei Minuten nach dem letzten Lebenszeichen des Dienstes.
            </li>
            <li>Benachrichtigungen (Titel, Text, Link, gelesen/ungelesen) im Benachrichtigungszentrum.</li>
            <li>
              Tretu-Credits: Kontostand und Buchungen (Betrag, Art, Grund, Dienst, Referenz, Zeitpunkt), einschließlich Startguthaben
              und täglicher Aufladung.
            </li>
          </UL>
          <P>
            Rechtsgrundlage ist die Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO). Spielereignisse ohne Tretu-ID
            speichern wir ohne Bezug zu einer Person.
          </P>
        </Sub>
        <Sub title="Push-Benachrichtigungen">
          <P>
            Nur wenn du Push-Benachrichtigungen im Browser erlaubst, speichern wir die Push-Adresse, die dein Browser dafür
            erzeugt, zusammen mit deinem Konto. Zugestellt werden die Nachrichten über den Push-Dienst deines Browsers (z. B.
            Google, Mozilla oder Apple); dabei kann eine Übermittlung in die USA stattfinden. Die Nachrichten enthalten nur Titel,
            kurzen Text und Link. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Du kannst
            die Benachrichtigungen jederzeit in den Einstellungen oder im Browser abschalten; die Push-Adresse wird dann gelöscht.
          </P>
        </Sub>
        <Sub title="TeamSpeak-Ranking">
          <P>
            Für das Ranking unter tretu.de/ranking fragt ein Hintergrunddienst unseren TeamSpeak-Server regelmäßig ab und
            speichert pro TeamSpeak-Identität: eindeutige Kennung, Datenbank-ID und Nickname, aktive Online-Zeit (gesamt, je Woche,
            Monat und Jahr), Leerlaufzeit, Rang und Prestige, erste und letzte Verbindung sowie ob du gerade online bist. Zur
            Erkennung von Leerlauf werden die Leerlaufzeit des Clients und der Name des Kanals ausgewertet (AFK-Kanäle zählen nicht).
            Aus dem Rang ergeben sich Server-Gruppen, die wir auf dem TeamSpeak-Server automatisch setzen. Die Rangliste zeigt
            Nickname, Rang, Online-Zeit und Online-Status öffentlich. Außerdem speichern wir die Zahl der verbundenen Clients ohne
            Personenbezug für die Auslastungsgrafik (30 Tage). Rechtsgrundlage ist unser berechtigtes Interesse, aktiven
            Community-Mitgliedern Ränge zu verleihen und die Aktivität sichtbar zu machen (Art. 6 Abs. 1 lit. f DSGVO). Wenn du
            nicht im Ranking erscheinen möchtest, schreib uns – wir nehmen dich dann aus der Wertung und der Rangliste heraus.
          </P>
        </Sub>
      </Section>

      <Section id="einbindungen" title="8. Eingebettete Inhalte Dritter">
        <P>
          Auf einigen Seiten von tretu.de kannst du Inhalte anderer Anbieter laden. Sie werden erst nach deinem Klick auf „laden“
          eingebunden (Zwei-Klick-Lösung); vorher werden keine Daten an den Anbieter übertragen. Beim Laden überträgt dein Browser
          deine IP-Adresse, die aufgerufene Seite und technische Angaben an den Anbieter, und der Anbieter kann Cookies setzen oder
          Daten im Browser speichern. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG).
        </P>
        <UL>
          <li>
            Twitch (Livestream): Twitch Interactive, Inc., 350 Bush Street, 2nd Floor, San Francisco, CA 94104, USA –{" "}
            <A href="https://www.twitch.tv/p/legal/privacy-notice/">Datenschutzhinweise</A>.
          </li>
          <li>
            Discord-Widget: Discord Inc., 444 De Haro Street, Suite 200, San Francisco, CA 94107, USA –{" "}
            <A href="https://discord.com/privacy">Datenschutzerklärung</A>.
          </li>
          <li>
            TSViewer (Anzeige der TeamSpeak-Kanäle): wird von tsviewer.com geladen –{" "}
            <A href="https://www.tsviewer.com">tsviewer.com</A>.
          </li>
          <li>
            YouTube-Videos: Klickst du in der Video-Übersicht auf ein Video, wird es über den erweiterten Datenschutzmodus
            (youtube-nocookie.com) von Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland, abgespielt –{" "}
            <A href="https://policies.google.com/privacy">Datenschutzerklärung</A>.
          </li>
        </UL>
      </Section>

      <Section id="saga" title="9. Saga">
        <P>Saga ({SERVICES.saga}) ist ein Rollenspiel, das eine KI als Spielleitung erzählt.</P>
        <Sub title="Konto und Inhalte">
          <UL>
            <li>
              Kontodaten: Benutzername, E-Mail-Adresse, Passwort (nur als sicherer Hash), optional Anzeigename; bei Anmeldung über
              das Tretu-Konto, Google oder Discord die dort übermittelten Angaben (siehe Abschnitt 6).
            </li>
            <li>
              Inhalte, die du erstellst oder die im Spiel entstehen: Charaktere, Welten, Kampagnen, Spielnachrichten, Würfelwürfe,
              generierte Bilder, Musik und Sprachausgaben.
            </li>
            <li>Credits-Stand, Käufe und Verbrauch (siehe Abschnitt 16).</li>
          </UL>
          <P>
            Öffentliche Helden und Welten sind auf deinem Profil für andere sichtbar; die Sichtbarkeit kannst du in den
            Einstellungen und bei jedem Inhalt ändern. Mitspieler einer Kampagne sehen die Helden der Gruppe und den Spielverlauf.
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.
          </P>
        </Sub>
        <Sub title="KI-Dienste">
          <P>
            Für Erzählung, generierte Inhalte, Bilder, Musik, Sprachausgabe und – wenn du sie nutzt – Spracheingabe übermitteln
            wir die dafür nötigen Spielinhalte (z. B. deine Aktionen, Charakter- und Weltbeschreibungen, bei Spracheingabe die
            Aufnahme deiner Stimme) an spezialisierte Anbieter:
          </P>
          <UL>
            <li>OpenAI (Texte, Bilder, Sprachausgabe, Spracherkennung): OpenAI, L.L.C. bzw. OpenAI Ireland Ltd.;</li>
            <li>Replicate (Bilder, Sprachausgabe, Musik): Replicate, Inc., USA;</li>
            <li>ElevenLabs (Sprachausgabe): ElevenLabs, Inc., USA.</li>
          </UL>
          <P>
            Diese Anbieter verarbeiten die Daten in unserem Auftrag und haben ihren Sitz bzw. ihre Server teilweise außerhalb der
            EU, insbesondere in den USA (siehe Abschnitt 19). Kontodaten wie E-Mail-Adresse oder Passwort übermitteln wir nicht.
            Bitte gib in Spielnachrichten keine sensiblen persönlichen Informationen ein. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b
            DSGVO, da ohne diese Verarbeitung das Spiel nicht funktioniert.
          </P>
        </Sub>
        <Sub title="Spielen über Discord">
          <P>
            Wenn eine Kampagne mit einem Discord-Kanal verbunden ist, verarbeitet unser Saga-Bot die Nachrichten, die Spieler in
            diesem Kanal an die Kampagne richten, sowie deren Discord-Namen, um sie der KI-Spielleitung zu übergeben und die Antworten
            im Kanal zu veröffentlichen.
          </P>
        </Sub>
      </Section>

      <Section id="play" title="10. Tretu Play">
        <P>
          Tretu Play ({SERVICES.play}) ist eine Sammlung von Browser-Spielen. Datenbank, Anmeldung und die Echtzeit-Verbindung für
          Mehrspieler-Partien laufen auf unserem Server in Deutschland; Schriftarten liefert unser Server aus.
        </P>
        <UL>
          <li>
            Kontodaten: Anzeigename, Benutzername, E-Mail-Adresse, Passwort (nur als sicherer Hash) oder Passkey (nur der öffentliche
            Schlüssel deines Geräts), gegebenenfalls Profilbild und die Verknüpfung zum Tretu-Konto, zu Google oder Discord.
          </li>
          <li>
            Gastkonten: Spielst du als Gast, legen wir ein Konto mit einem zufälligen Namen an, ohne dass du eine E-Mail-Adresse
            angeben musst. Erstellst du später ein richtiges Konto, übernehmen wir deinen Fortschritt.
          </li>
          <li>
            Spieldaten: Partien mit Teilnehmern, Platzierungen und Punkten, Solitaire-Runden, Erfolge, Freundschaften, selbst
            erstellte Punchline-Decks sowie Credits und deren Buchungen.
          </li>
          <li>Sitzungsdaten: für jede Anmeldung eine Sitzung mit IP-Adresse und Browser-Kennung.</li>
        </UL>
        <P>
          Dein Anzeigename, Benutzername, Profilbild sowie Statistiken und Erfolge sind auf deinem öffentlichen Profil und in den
          Bestenlisten sichtbar. Mitspieler sehen in einer Partie deinen Namen, dein Profilbild und deine Reaktionen; Freunde
          sehen, ob du online bist, und können deine geteilten Decks verwenden. Für Zug-Benachrichtigungen gilt der Abschnitt
          „Push-Benachrichtigungen“ in Abschnitt 7 entsprechend.
        </P>
        <P>
          Spielst du Globetrotter, lädt dein Browser die Straßenbilder direkt von den Servern des offenen Projekts Panoramax
          (betrieben unter anderem von OpenStreetMap France und weiteren Instanzen) und die Kartenkacheln von der OpenStreetMap
          Foundation, St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Vereinigtes Königreich. Dabei werden deine
          IP-Adresse und technische Angaben deines Browsers an diese Server übermittelt. Ohne diese Abrufe lässt sich das Spiel
          nicht darstellen (Art. 6 Abs. 1 lit. b und f DSGVO).
        </P>
        <P>
          Zum Betrieb und zur Bearbeitung von Missbrauch können berechtigte Team-Mitglieder die zu deinem Konto gespeicherten
          Daten einsehen und etwa Credits korrigieren oder Konten bei Verstößen sperren; jede solche Änderung wird protokolliert.
          Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b und f DSGVO. Sitzungen laufen nach spätestens 30 Tagen ab; Gastkonten
          löschen wir automatisch, wenn ihre letzte Sitzung seit mehr als 30 Tagen abgelaufen ist. Dein Konto kannst du in den
          Einstellungen selbst löschen; in vergangenen Partien anderer bleibt nur der damals verwendete Anzeigename ohne
          Verbindung zu deinem Konto erhalten.
        </P>
        <Sub title="Besucherstatistik von Tretu Play">
          <P>
            Tretu Play zählt Seitenaufrufe mit einer eigenen Statistik auf unserem Server, ohne Cookies und ohne externe
            Dienste. Gezählt werden Seiten, die du im Browser aufrufst; Aufrufe durch erkennbare Bots und Programme werden nicht
            mitgezählt. Ausgewertet werden dabei nur Angaben, die dein Browser bei jedem Seitenaufruf ohnehin mitsendet: die
            aufgerufene Seite (Adressen einzelner Räume und Profile werden zu je einem Eintrag zusammengefasst), die Domain der
            Website, von der du kommst, bzw. eine Kampagnenangabe in der Adresse („utm_source“), der Gerätetyp (Smartphone, Tablet
            oder Computer, abgeleitet aus der Browser-Kennung) und die Sprache (aus der Adresse, dem Sprach-Cookie oder der
            Spracheinstellung deines Browsers).
          </P>
          <P>
            Damit wir Besucher eines Tages nur einmal zählen, berechnet der Server aus deiner IP-Adresse, deiner Browser-Kennung
            und einem Zufallswert, der jeden Tag neu erzeugt wird, eine gekürzte Prüfsumme (Hash). Zufallswert und Prüfsummen
            liegen nur im Arbeitsspeicher, werden nie gespeichert und mit dem ersten Seitenaufruf nach Mitternacht (deutscher
            Zeit) bzw. bei einem Neustart des Servers verworfen; über mehrere Tage oder zu dir lassen sie sich nicht
            zurückverfolgen. In der Datenbank speichern wir ausschließlich Tagessummen – Aufrufe und Besucher je Seite, Herkunft,
            Gerätetyp und Sprache – ohne Bezug zu einzelnen Personen. Diese Summen sehen nur die Administratoren von Tretu Play;
            wir bewahren sie ohne feste Frist auf.
          </P>
          <P>
            Rechtsgrundlage ist unser berechtigtes Interesse, zu verstehen, wie Tretu Play genutzt wird, und das Angebot zu
            verbessern (Art. 6 Abs. 1 lit. f DSGVO). Du kannst dem jederzeit widersprechen (<A href="#widerspruch">Abschnitt 22</A>).
          </P>
        </Sub>
      </Section>

      <Section id="hollowmere" title="11. Hollowmere">
        <P>
          Hollowmere ist ein Spiel für Browser und Desktop. Website ({SERVICES.hollowmere}) und Spielserver betreiben wir auf
          unserem Server in Deutschland; als Spielserver nutzen wir die Open-Source-Software Nakama, die wir selbst betreiben.
          Offline bleibt dein Spielstand auf deinem Gerät.
        </P>
        <UL>
          <li>
            Konto: E-Mail-Adresse und Passwort (nur als Hash), Anmeldung über das Tretu-Konto, Google, Apple oder Discord (wir
            speichern die Konto-Kennung des Anbieters und eine E-Mail-Adresse nur, wenn der Anbieter sie mitschickt; bei Discord
            prüft unser Server das Anmelde-Token einmal bei Discord und behält es nicht) oder ein Gastzugang mit einer zufälligen
            Kennung auf deinem Gerät; dazu ein Anzeigename und ein Sitzungs-Token auf dem Gerät.
          </li>
          <li>
            Cloud-Speicherstände: Solange du angemeldet bist und die Cloud-Sicherung nicht ausschaltest, liegt jeder Spielstand
            (Hofname, Farmername, Tag, Geld, Kreaturen, Gegenstände, Gebäude, Fortschritt) zusätzlich auf unserem Server, nur für
            dein Konto.
          </li>
          <li>Einstellungen am Konto: Lautstärken, Sprache, Tastenbelegung, gesehene Tutorials.</li>
          <li>
            Koop: Die anderen Spieler einer Runde sehen deinen Anzeigenamen, den gemeinsamen Hof und deine Chat-Nachrichten in
            dieser Runde.
          </li>
          <li>
            KI-Agenten: Legst du ein Token für einen KI-Helfer an, speichern wir einen Hash des Tokens, seine Rechte und das
            Ablaufdatum. Befehle des Helfers halten wir nur, bis dein offenes Spiel antwortet. Den Spielstand schicken nicht wir an
            den Anbieter des Helfers, sondern dein eigenes Programm.
          </li>
          <li>
            Fehlerberichte (in Release-Fassungen, solange du angemeldet bist): Fehlertext, Stelle im Code, Spielversion und
            Plattform – ohne E-Mail-Adresse und Spielstand. Du kannst sie in den Einstellungen abschalten.
          </li>
          <li>
            Spielstatistiken (nur mit deiner Zustimmung): Spielminuten, Spielversion, Plattform und Tag im Spiel.
          </li>
        </UL>
        <P>
          Rechtsgrundlagen: Konto, Cloud-Speicherstände, Einstellungen und Koop Art. 6 Abs. 1 lit. b DSGVO; Fehlerberichte unser
          berechtigtes Interesse, Abstürze zu finden und zu beheben (Art. 6 Abs. 1 lit. f DSGVO); Spielstatistiken deine
          Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Lädst du Hollowmere über eine Vertriebsplattform herunter, verarbeitet diese
          die dabei anfallenden Daten in eigener Verantwortung. Cloud-Speicherstände bleiben, bis du den Hof im Spiel löschst oder
          wir das Konto löschen.
        </P>
      </Section>

      <Section id="minecraft" title="12. Minecraft-Server und Dashboard">
        <Sub title="Spielserver">
          <P>
            Wenn du auf unserem Minecraft-Server spielst, verarbeiten wir deine Minecraft-UUID, deinen Spielernamen, deine
            IP-Adresse, Verbindungszeiten, Chat-Nachrichten und Befehle, Spielstatistiken und Fortschritte, Inventare und
            Spielwelt-Daten sowie ein Protokoll deiner Aktionen in der Welt (z. B. abgebaute und gesetzte Blöcke mit Ort und Zeit),
            das wir zur Aufklärung von Zerstörungen (Griefing) benötigen. Dazu kommen Spielzeit und Spielzeit-Limits sowie freiwillige
            Basis-Markierungen auf der 3D-Karte. Die Karte zeigt die Welt und die Positionen der Spieler, die gerade online sind.
          </P>
          <P>
            Die KI-Mitspielerin „Astra“ antwortet, wenn du sie im Chat ansprichst. Dafür übermitteln wir deine an sie gerichtete
            Nachricht, deinen Spielernamen und die nötigen Angaben zur Spielsituation an einen KI-Anbieter (je nach Einstellung
            OpenAI, Anthropic PBC, USA, oder Amazon Bedrock von Amazon Web Services); Astra merkt sich pro Spieler einige Fakten,
            die du mit „/astra vergiss“ löschen kannst.
          </P>
        </Sub>
        <Sub title="Dashboard (mc.tretu.de)">
          <P>
            Im Dashboard meldest du dich mit einem Code an, den du im Spiel mit „/dashboard“ erhältst, oder mit deinem Tretu-Konto;
            dabei wird ein Sitzungs-Cookie gesetzt. Das Dashboard zeigt Spieler, Erfolge, Bestenlisten, Chronik, Wochenrückblick,
            Gemeinschaftsprojekte und Shops. Für Bonus-Spielzeit kannst du freiwillig alltägliche Aufgaben abhaken (etwa Sport,
            Schritte, Lesen, Meditation); wir speichern, welche Aufgabe du an welchem Tag abgehakt hast, und berechnen daraus
            Bonus-Minuten und Serien. Bitte hake nur ab, was du anderen zeigen möchtest – Serien und Belohnungen sind im Spiel
            sichtbar.
          </P>
          <P>
            Hast du dein Minecraft-Konto mit deinem Tretu-Konto verknüpft, melden wir deine Spielminuten an die Tretu-Plattform
            (Abschnitt 7). Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b DSGVO (Spielbetrieb, Dashboard, Plattform) und Art. 6 Abs. 1
            lit. f DSGVO (Schutz vor Griefing und Missbrauch, Sicherheit des Servers).
          </P>
        </Sub>
      </Section>

      <Section id="teamspeak-discord" title="13. TeamSpeak, Discord und soziale Netzwerke">
        <Sub title="TeamSpeak-Server">
          <P>
            Unseren TeamSpeak-Server betreiben wir selbst. Bei der Verbindung verarbeitet er deine IP-Adresse, deine eindeutige
            TeamSpeak-Identität, deinen Nickname, Kanal, Verbindungszeiten und Server-Gruppen; Sprache wird übertragen, aber nicht
            aufgezeichnet. Für das Ranking gilt Abschnitt 7. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b und f DSGVO.
          </P>
        </Sub>
        <Sub title="Discord-Server und Bots">
          <P>
            Unser Community-Server auf Discord wird über die Plattform von Discord Inc. betrieben, die dabei eigene Daten in eigener
            Verantwortung verarbeitet. Wir sehen als Server-Betreiber deinen Discord-Namen, deine Nachrichten und Rollen auf unserem
            Server. Unsere Bots (z. B. der Saga-Bot) verarbeiten Nachrichten nur in den Kanälen und für die Funktionen, für die sie
            eingerichtet sind.
          </P>
        </Sub>
        <Sub title="Profile in sozialen Netzwerken">
          <P>
            Wir unterhalten Profile auf Twitch, YouTube und Facebook. Wenn du dort mit uns interagierst, verarbeiten die Betreiber
            deine Daten nach ihren eigenen Bestimmungen. Für Statistiken zu unserer Facebook-Seite („Insights“) sind wir gemeinsam
            mit Meta Platforms Ireland Limited, Merrion Road, Dublin 4, Irland, verantwortlich (Art. 26 DSGVO); Meta übernimmt nach
            der Vereinbarung die primäre Verantwortung und die Erfüllung der Betroffenenrechte. Wir erhalten nur zusammengefasste
            Statistiken. Rechtsgrundlage ist unser berechtigtes Interesse an der Kommunikation mit der Community (Art. 6 Abs. 1 lit. f
            DSGVO).
          </P>
        </Sub>
      </Section>

      <Section id="game-server" title="14. Game-Server-Dashboard (Team)">
        <P>
          Das interne Dashboard unter tretu.de/dashboard nutzen nur Team-Mitglieder mit entsprechender Rolle. Wir speichern dazu
          Rollen und ein Protokoll der ausgelösten Aktionen (wer hat wann welchen Server gestartet, gesichert oder geändert;
          Konsolenbefehle mit Inhalt). Für die Server-Verwaltung nutzen wir die Schnittstellen von Hetzner (virtuelle Maschinen,
          Speicher, Firewalls) und Cloudflare (DNS) sowie Modrinth, CurseForge und Mojang für Downloads; an diese übermitteln wir
          keine personenbezogenen Daten der Spieler. Rechtsgrundlage ist unser berechtigtes Interesse an einer nachvollziehbaren,
          sicheren Verwaltung (Art. 6 Abs. 1 lit. f DSGVO).
        </P>
      </Section>

      <Section id="email" title="15. E-Mail-Versand und Kontakt">
        <P>
          System-E-Mails – etwa zum Bestätigen deiner E-Mail-Adresse, zum Ändern der Adresse oder zum Zurücksetzen deines
          Passworts – versenden wir über Amazon Simple Email Service (Amazon Web Services EMEA SARL, 38 Avenue John F. Kennedy,
          L-1855 Luxemburg) in der Region Frankfurt (eu-central-1). Dabei werden deine E-Mail-Adresse, dein Name und der Inhalt der
          jeweiligen E-Mail verarbeitet. Wir versenden keine Werbung und keine Newsletter. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b
          DSGVO.
        </P>
        <P>
          Wenn du uns per E-Mail, Telefon oder über Discord kontaktierst, verarbeiten wir deine Angaben, um deine Anfrage zu
          beantworten (Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO), und löschen sie, wenn sie nicht mehr erforderlich sind und keine
          Aufbewahrungspflichten bestehen.
        </P>
      </Section>

      <Section id="zahlungen" title="16. Zahlungen und Tretu-Credits">
        <P>
          Credit-Pakete, die du in einem Dienst (z. B. Saga) kaufst, bezahlst du über Stripe (Stripe Payments Europe, Limited, 1
          Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Irland). Die Zahlungsdaten (z. B. Karten- oder Kontodaten)
          gibst du direkt bei Stripe ein; wir erhalten sie nicht. Wir erhalten von Stripe nur, ob und wann die Zahlung erfolgt ist,
          Betrag, Währung, eine Zahlungsreferenz und die E-Mail-Adresse, an die der Beleg geht. Stripe verarbeitet die Daten zur
          Zahlungsabwicklung in unserem Auftrag und zur Betrugsprävention sowie zur Erfüllung eigener gesetzlicher Pflichten in
          eigener Verantwortung (<A href="https://stripe.com/de/privacy">Datenschutzerklärung von Stripe</A>); dabei kann eine
          Übermittlung in die USA stattfinden.
        </P>
        <P>
          Den Kauf schreiben wir deinem Credits-Konto auf der Tretu-Plattform gut (Abschnitt 7). Rechtsgrundlagen sind Art. 6
          Abs. 1 lit. b DSGVO (Vertrag) und Art. 6 Abs. 1 lit. c DSGVO (Aufbewahrung von Buchungsbelegen nach § 147 AO und § 257
          HGB).
        </P>
      </Section>

      <Section id="statistik" title="17. Statistik und Statusseite">
        <Sub title="Keine Analyse- oder Tracking-Dienste">
          <P>
            Auf {SERVICES.hub}, {SERVICES.auth}, in Saga, bei Hollowmere und im Minecraft-Dashboard setzen wir keine Analyse- oder
            Tracking-Werkzeuge ein (etwa Analyse-Skripte oder Zählpixel), weder eigene noch von Dritten. Tretu Play zählt Seitenaufrufe mit einer eigenen
            Statistik ohne Cookies, die nur Tagessummen speichert (<A href="#play">Abschnitt 10</A>). Spielstatistiken in
            Hollowmere erheben wir nur mit deiner Einwilligung (<A href="#hollowmere">Abschnitt 11</A>).
          </P>
        </Sub>
        <Sub title="Statusseite">
          <P>
            Unter {SERVICES.status} zeigen wir, ob unsere Dienste erreichbar sind. Dafür ruft unser eigener Server einmal pro Minute
            die technischen Statusadressen unserer Dienste ab und speichert, ob und wie schnell sie geantwortet haben
            (Einzelprüfungen 7 Tage, Stunden- und Tageswerte 90 Tage). Beim Minecraft- und beim TeamSpeak-Server fragen wir
            außerdem ab, wie viele Spieler bzw. Nutzer gerade verbunden sind, und zeigen diese Zahl an. Die Server liefern
            dabei technisch bedingt auch Namen bzw. Kennungen verbundener Personen mit; diese werten wir nicht aus und
            speichern sie nicht, gespeichert wird nur die Anzahl. Rechtsgrundlage ist unser berechtigtes Interesse, über die
            Erreichbarkeit unserer Dienste zu informieren (Art. 6 Abs. 1 lit. f DSGVO). Für den Aufruf der Statusseite gelten die Angaben zu den Server-Logfiles in <A href="#hosting">Abschnitt 4</A>.
          </P>
        </Sub>
      </Section>

      <Section id="empfaenger" title="18. Empfänger und Auftragsverarbeiter">
        <P>
          Wir geben personenbezogene Daten nur weiter, wenn dies für die beschriebenen Zwecke nötig ist, du eingewilligt hast oder
          wir gesetzlich dazu verpflichtet sind. Empfänger sind:
        </P>
        <Table
          head={["Empfänger", "Zweck", "Rolle"]}
          rows={[
            ["Hetzner Online GmbH, Deutschland", "Server, Speicher, Spielserver-VMs", "Auftragsverarbeiter"],
            ["Cloudflare, Inc., USA", "DNS, Netzwerkdienste", "Auftragsverarbeiter"],
            ["Amazon Web Services EMEA SARL, Luxemburg", "System-E-Mails (SES); ggf. KI (Bedrock) für Astra", "Auftragsverarbeiter"],
            ["Stripe Payments Europe, Ltd., Irland", "Zahlungsabwicklung", "Auftragsverarbeiter bzw. eigene Verantwortung (Betrugsprävention)"],
            ["OpenAI, Replicate, Inc., ElevenLabs, Inc.", "KI-Funktionen in Saga", "Auftragsverarbeiter"],
            ["OpenAI, Anthropic PBC, Amazon Bedrock", "KI-Mitspielerin Astra (Minecraft)", "Auftragsverarbeiter"],
            ["Discord, Google, Apple", "Anmeldung, wenn du sie wählst", "eigene Verantwortung"],
            ["Push-Dienste der Browser-Hersteller", "Zustellung von Push-Benachrichtigungen", "eigene Verantwortung"],
            ["Twitch, Discord, TSViewer, YouTube", "eingebettete Inhalte nach deinem Klick", "eigene Verantwortung"],
            ["Panoramax-Instanzen, OpenStreetMap Foundation", "Bilder und Karten in Globetrotter (Play)", "eigene Verantwortung"],
            ["Meta Platforms Ireland Ltd.", "Statistiken der Facebook-Seite", "gemeinsame Verantwortung"],
            ["Behörden, Gerichte, Berater", "wenn gesetzlich erforderlich oder zur Rechtsverfolgung", "eigene Verantwortung"],
          ]}
        />
        <P>
          Mit unseren Auftragsverarbeitern bestehen bzw. gelten Verträge nach Art. 28 DSGVO. Die Tretu-Dienste selbst sind keine
          getrennten Unternehmen: Daten fließen zwischen ihnen nur so, wie in dieser Erklärung beschrieben.
        </P>
      </Section>

      <Section id="drittland" title="19. Übermittlung in Drittländer">
        <P>
          Einige der genannten Anbieter sitzen in den USA oder verarbeiten Daten dort (Cloudflare, Stripe, OpenAI, Replicate,
          ElevenLabs, Anthropic, Amazon, Discord, Google, Apple, Twitch sowie Push-Dienste). Für die USA hat die EU-Kommission
          am 10. Juli 2023 einen Angemessenheitsbeschluss erlassen (EU-US Data Privacy Framework); Übermittlungen an Anbieter, die
          danach zertifiziert sind, stützen wir auf Art. 45 DSGVO. Bei Anbietern ohne Zertifizierung vereinbaren wir die
          Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO) und prüfen ergänzende Maßnahmen. Für das
          Vereinigte Königreich (OpenStreetMap Foundation) besteht ein Angemessenheitsbeschluss (Art. 45 DSGVO). Wenn du
          eingebettete Inhalte lädst oder dich über einen Anbieter anmeldest, erfolgt die Übermittlung auf deine Veranlassung
          (Art. 49 Abs. 1 lit. a bzw. b DSGVO). Auf Anfrage stellen wir dir eine Kopie der jeweiligen Garantien zur Verfügung.
        </P>
      </Section>

      <Section id="speicherdauer" title="20. Speicherdauer">
        <P>
          Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck erforderlich ist, und löschen sie
          danach, soweit keine gesetzlichen Aufbewahrungspflichten bestehen. Im Einzelnen:
        </P>
        <Table
          head={["Daten", "Speicherdauer"]}
          rows={[
            ["Server-Logfiles", "höchstens 7 Tage"],
            ["Sitzungen", "bis zur Abmeldung, höchstens 30 Tage (Play: 30 Tage)"],
            ["Konten, Profile, Spielstände, Inhalte", "bis zur Löschung des Kontos bzw. des Inhalts"],
            ["Anwesenheit (online/spielt)", "2 Minuten nach dem letzten Lebenszeichen"],
            ["Gastkonten (Play)", "automatisch 30 Tage nach Ablauf der letzten Sitzung"],
            ["Auslastungsdaten TeamSpeak / Spielserver-Status", "30 Tage bzw. 2 Tage, ohne Personenbezug"],
            [
              "Besucherstatistik Tretu Play",
              "Prüfsummen nur im Arbeitsspeicher bis zum Tageswechsel; Tagessummen ohne Personenbezug ohne feste Frist",
            ],
            [
              "Ergebnisse der Statusprüfungen",
              "7 Tage (Einzelprüfungen), 90 Tage (Stunden- und Tageswerte); von Spiel- und TeamSpeak-Servern nur die Anzahl der Verbundenen",
            ],
            ["Buchungen von Credits, Zahlungsbelege", "10 Jahre (§ 147 AO, § 257 HGB), danach Löschung"],
            ["Kontaktanfragen", "bis zur Erledigung, danach soweit keine Pflichten bestehen"],
            ["Protokolle des Game-Server-Dashboards", "solange der jeweilige Server besteht"],
          ]}
        />
        <P>
          Löschst du dein Tretu-Konto, informieren wir alle Dienste, die deine Daten dann ebenfalls löschen oder so anonymisieren,
          dass kein Personenbezug mehr besteht (z. B. bleibt in Ranglisten oder vergangenen Partien anderer nur ein anonymer Eintrag).
          Daten, die wir aufbewahren müssen, sperren wir bis zum Ablauf der Frist.
        </P>
      </Section>

      <Section id="rechte" title="21. Deine Rechte">
        <P>Du hast gegenüber uns folgende Rechte hinsichtlich der dich betreffenden personenbezogenen Daten:</P>
        <UL>
          <li>Recht auf Auskunft (Art. 15 DSGVO),</li>
          <li>Recht auf Berichtigung (Art. 16 DSGVO),</li>
          <li>Recht auf Löschung (Art. 17 DSGVO),</li>
          <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
          <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO),</li>
          <li>Recht auf Widerspruch gegen die Verarbeitung (Art. 21 DSGVO, siehe unten),</li>
          <li>Recht, eine Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen (Art. 7 Abs. 3 DSGVO).</li>
        </UL>
        <P>
          Viele Angaben kannst du selbst unter „Mein Konto“ und in den Einstellungen der Dienste einsehen, ändern oder löschen. Für
          alle anderen Anliegen schreib uns an {OPERATOR.emailObfuscated}.
        </P>
        <P>
          Außerdem hast du das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), insbesondere in dem
          Mitgliedstaat deines Aufenthaltsorts, deines Arbeitsplatzes oder des mutmaßlichen Verstoßes. Für uns zuständig ist: Der
          Hamburgische Beauftragte für Datenschutz und Informationsfreiheit, Ludwig-Erhard-Str. 22, 20459 Hamburg,{" "}
          <A href="https://datenschutz-hamburg.de">datenschutz-hamburg.de</A>.
        </P>
      </Section>

      <Section id="widerspruch" title="22. Widerspruchsrecht">
        <Box>
          <P>
            <strong>Widerspruchsrecht nach Art. 21 DSGVO</strong>
          </P>
          <P>
            Verarbeiten wir deine Daten auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO), hast du das Recht, aus
            Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit Widerspruch dagegen einzulegen. Wir verarbeiten die
            Daten dann nicht mehr, es sei denn, wir können zwingende schutzwürdige Gründe für die Verarbeitung nachweisen, die deine
            Interessen, Rechte und Freiheiten überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung
            von Rechtsansprüchen.
          </P>
          <P>
            Eine Verarbeitung zu Zwecken der Direktwerbung findet nicht statt. Der Widerspruch ist formlos möglich, am einfachsten
            per E-Mail an {OPERATOR.emailObfuscated}.
          </P>
        </Box>
      </Section>

      <Section id="sonstiges" title="23. Pflicht zur Bereitstellung, automatisierte Entscheidungen, Minderjährige">
        <P>
          Die Angabe von Daten ist weder gesetzlich noch vertraglich vorgeschrieben. Ohne die als erforderlich gekennzeichneten
          Angaben (z. B. E-Mail-Adresse beim Konto) können wir die jeweilige Funktion aber nicht bereitstellen.
        </P>
        <P>
          Eine ausschließlich automatisierte Entscheidung im Sinne von Art. 22 DSGVO, die dir gegenüber rechtliche Wirkung entfaltet
          oder dich ähnlich erheblich beeinträchtigt, findet nicht statt. Die Erzeugung von Spielinhalten durch KI, die Berechnung
          von Rängen, Leveln und Abzeichen sowie automatische Spiel-Belohnungen sind keine solchen Entscheidungen.
        </P>
        <P>
          Unsere Dienste richten sich an Personen ab 16 Jahren. Wenn du jünger bist, brauchst du für ein Konto und für
          Einwilligungen die Zustimmung deiner Eltern oder Erziehungsberechtigten (Art. 8 DSGVO). Hollowmere und der
          Minecraft-Server richten sich nicht an Kinder unter 16 Jahren; wenn du meinst, dass wir ohne diese Zustimmung Daten eines
          Kindes verarbeiten, schreib uns, wir löschen sie dann.
        </P>
      </Section>

      <Section id="aenderungen" title="24. Änderungen dieser Datenschutzerklärung">
        <P>
          Wir passen diese Datenschutzerklärung an, wenn sich unsere Dienste oder die Rechtslage ändern. Es gilt die jeweils hier
          veröffentlichte Fassung; das Datum steht oben. Über wesentliche Änderungen, die dein Konto betreffen, informieren wir dich
          zusätzlich im jeweiligen Dienst oder per E-Mail.
        </P>
      </Section>
    </>
  );
}
