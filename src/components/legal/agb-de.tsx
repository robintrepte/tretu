import { A, Box, OL, P, Section, Sub, UL } from "@/components/legal/legal-page";
import { OPERATOR, SERVICES } from "@/components/legal/operator";

export const AGB_TOC_DE = [
  { id: "geltung", title: "Geltungsbereich und Anbieter" },
  { id: "konto", title: "Tretu-Konto und Vertragsschluss" },
  { id: "leistungen", title: "Leistungen und Verfügbarkeit" },
  { id: "regeln", title: "Verhaltensregeln" },
  { id: "inhalte", title: "Inhalte von Nutzern und KI-Inhalte" },
  { id: "credits", title: "Tretu-Credits" },
  { id: "kauf", title: "Kauf von Credits" },
  { id: "widerruf", title: "Widerrufsbelehrung" },
  { id: "maengel", title: "Gewährleistung" },
  { id: "haftung", title: "Haftung" },
  { id: "laufzeit", title: "Laufzeit, Kündigung und Löschung des Kontos" },
  { id: "dienste", title: "Besondere Bestimmungen für einzelne Dienste" },
  { id: "aenderungen", title: "Änderungen dieser Bedingungen" },
  { id: "schluss", title: "Streitbeilegung und Schlussbestimmungen" },
];

export function AgbDe() {
  return (
    <>
      <Section id="geltung" title="§ 1 Geltungsbereich und Anbieter">
        <OL>
          <li>
            Diese Allgemeinen Geschäfts- und Nutzungsbedingungen („Bedingungen“) gelten für die Nutzung aller Dienste der Marke{" "}
            {OPERATOR.brand}, insbesondere {SERVICES.hub} mit der Tretu-Plattform, das Tretu-Konto ({SERVICES.auth}), Saga (
            {SERVICES.saga}), Tretu Play ({SERVICES.play}), Hollowmere ({SERVICES.hollowmere} und Spiel-Apps), den
            Minecraft-Server mit Dashboard ({SERVICES.minecraft}) sowie unsere TeamSpeak- und Discord-Server (zusammen „Dienste“),
            und für die Tretu-Credits.
          </li>
          <li>
            Anbieter und dein Vertragspartner ist die {OPERATOR.company}, {OPERATOR.street}, {OPERATOR.zip} {OPERATOR.city}{" "}
            („wir“, „uns“). {OPERATOR.brand} ist eine Marke der {OPERATOR.company}. Die weiteren Angaben findest du im{" "}
            <A href="/impressum">Impressum</A>.
          </li>
          <li>
            Verbraucher im Sinne dieser Bedingungen ist jede natürliche Person, die ein Rechtsgeschäft zu Zwecken abschließt, die
            überwiegend weder ihrer gewerblichen noch ihrer selbständigen beruflichen Tätigkeit zugerechnet werden können (§ 13 BGB).
          </li>
          <li>
            Abweichende Bedingungen von Nutzern gelten nicht, auch wenn wir ihnen nicht ausdrücklich widersprechen. Ergänzend gelten
            die besonderen Bestimmungen für einzelne Dienste in § 12; im Widerspruchsfall gehen sie diesen allgemeinen Regeln vor.
          </li>
          <li>
            Wie wir mit personenbezogenen Daten umgehen, regelt unsere <A href="/datenschutz">Datenschutzerklärung</A>.
          </li>
        </OL>
      </Section>

      <Section id="konto" title="§ 2 Tretu-Konto und Vertragsschluss">
        <OL>
          <li>
            Viele Dienste kannst du ohne Konto oder als Gast nutzen. Für andere Funktionen brauchst du ein Tretu-Konto; mit ihm
            meldest du dich bei allen Diensten an (die Dienste haben keine eigene Anmeldung). Mit der Registrierung bzw. der ersten
            Anmeldung kommt ein unentgeltlicher Nutzungsvertrag nach diesen Bedingungen zustande.
          </li>
          <li>
            Deine Angaben müssen zutreffen; deine Zugangsdaten musst du geheim halten und vor dem Zugriff Dritter schützen. Pro
            Person ist ein Tretu-Konto vorgesehen. Konten sind nicht übertragbar.
          </li>
          <li>
            Du musst mindestens 16 Jahre alt sein. Bist du jünger, brauchst du die Zustimmung deiner Eltern oder
            Erziehungsberechtigten. Credits kaufen darf nur, wer voll geschäftsfähig ist oder die Zustimmung der
            Erziehungsberechtigten hat.
          </li>
          <li>
            Ein Anspruch auf Abschluss eines Nutzungsvertrags besteht nicht. Wir dürfen eine Registrierung ablehnen, insbesondere
            wenn ein früheres Konto wegen Verstößen gesperrt wurde.
          </li>
        </OL>
      </Section>

      <Section id="leistungen" title="§ 3 Leistungen und Verfügbarkeit">
        <OL>
          <li>
            Die Dienste sind grundsätzlich kostenlos. Kostenpflichtig ist nur der Kauf von Credit-Paketen (§ 7); welche Funktionen
            Credits verbrauchen, zeigt der jeweilige Dienst vor der Nutzung an.
          </li>
          <li>
            Wir bemühen uns um einen störungsfreien Betrieb, können aber keine ständige Verfügbarkeit garantieren. Wartung,
            Sicherheitsvorfälle, Störungen bei Dritten (z. B. KI-Anbietern, Zahlungsdienstleistern, Discord) oder höhere Gewalt
            können die Nutzung zeitweise einschränken.
          </li>
          <li>
            Wir entwickeln die Dienste weiter und dürfen Spiele und Funktionen ändern, ergänzen oder einstellen, soweit dies unter
            Berücksichtigung deiner Interessen zumutbar ist, insbesondere wenn sich technische oder rechtliche Rahmenbedingungen
            ändern. Stellen wir einen Dienst ein, in dem gekaufte Credits verwendet werden können, informieren wir dich mindestens
            sechs Wochen vorher; für dann nicht mehr nutzbare gekaufte Credits gilt § 6 Abs. 7.
          </li>
        </OL>
      </Section>

      <Section id="regeln" title="§ 4 Verhaltensregeln">
        <P>Bitte geh fair und respektvoll mit anderen um. Nicht erlaubt ist insbesondere:</P>
        <UL>
          <li>
            beleidigende, diskriminierende, gewaltverherrlichende, sexuell anstößige oder sonst rechtswidrige Namen, Profilbilder,
            Nachrichten oder Inhalte zu verwenden oder zu erzeugen,
          </li>
          <li>andere zu belästigen, zu bedrohen, zu täuschen oder sich als jemand anderes – auch als Team-Mitglied – auszugeben,</li>
          <li>personenbezogene Daten anderer ohne deren Einverständnis zu veröffentlichen,</li>
          <li>
            zu schummeln, Fehler auszunutzen oder Spiele, Ranglisten, Statistiken oder Credits durch Skripte, Bots, mehrere Konten
            oder auf andere unzulässige Weise zu manipulieren,
          </li>
          <li>
            die Dienste anzugreifen, zu überlasten, automatisiert auszulesen oder Sicherheitsmaßnahmen zu umgehen, soweit wir dies
            nicht ausdrücklich erlauben (z. B. über eine dokumentierte Schnittstelle),
          </li>
          <li>Werbung oder Spam zu verbreiten oder die Dienste gewerblich zu nutzen, ohne dass wir zugestimmt haben.</li>
        </UL>
        <P>
          Auf unseren Community-Servern (Minecraft, TeamSpeak, Discord) gelten zusätzlich die dort veröffentlichten Server-Regeln
          und die Anweisungen der Moderation.
        </P>
      </Section>

      <Section id="inhalte" title="§ 5 Inhalte von Nutzern und KI-Inhalte">
        <OL>
          <li>
            Für Inhalte, die du selbst einstellst oder erzeugen lässt (z. B. Namen, Profile, Nachrichten, Charaktere, Welten, eigene
            Karten und Decks, Bauwerke), bist du verantwortlich. Du versicherst, dass du die nötigen Rechte daran hast und dass sie
            nicht gegen Gesetze oder Rechte Dritter verstoßen.
          </li>
          <li>
            Du räumst uns an diesen Inhalten das einfache, unentgeltliche, auf die Dauer ihrer Speicherung beschränkte Recht ein,
            sie zu speichern, technisch zu bearbeiten und im Rahmen der Dienste anzuzeigen – je nach den Sichtbarkeitseinstellungen
            nur dir, deinen Mitspielern und Freunden oder öffentlich. Weitere Rechte erhalten wir nicht.
          </li>
          <li>
            Einige Dienste, insbesondere Saga, erzeugen Texte, Bilder, Musik und Sprache automatisiert mithilfe künstlicher
            Intelligenz. Diese Inhalte entstehen ohne menschliche Prüfung, können unzutreffend, unpassend oder anderen Inhalten
            ähnlich sein und stellen keine Meinung oder Empfehlung von uns dar. Sie dienen der Unterhaltung; verlasse dich nicht für
            Entscheidungen in der echten Welt (z. B. zu Gesundheit, Recht oder Finanzen) auf sie. Soweit an solchen Inhalten Rechte
            entstehen, darfst du sie für private, nicht kommerzielle Zwecke nutzen.
          </li>
          <li>
            Wir dürfen Inhalte, die gegen diese Bedingungen oder Gesetze verstoßen, entfernen oder unzugänglich machen und Namen
            ändern. Rechtswidrige Inhalte kannst du uns jederzeit melden (Kontakt siehe Impressum).
          </li>
        </OL>
      </Section>

      <Section id="credits" title="§ 6 Tretu-Credits">
        <OL>
          <li>
            Tretu-Credits („Credits“, Kürzel „TC“) sind eine virtuelle Verrechnungseinheit, mit der du bestimmte Funktionen in
            unseren Diensten nutzen kannst (z. B. KI-Erzählungen und Bilder in Saga). Dein Credits-Konto ist an dein Tretu-Konto
            gebunden und in allen teilnehmenden Diensten dasselbe.
          </li>
          <li>
            <strong className="text-foreground">Credits haben keinen Geldwert.</strong> Sie sind kein Geld und kein E-Geld, werden
            nicht verzinst, können nicht ausgezahlt, nicht in Geld oder andere Werte umgetauscht und nicht verkauft werden.
          </li>
          <li>
            <strong className="text-foreground">Credits sind nicht übertragbar</strong> – weder auf andere Konten noch auf andere
            Personen – und dürfen nicht außerhalb unserer Dienste gehandelt werden.
          </li>
          <li>
            Credits erhältst du kostenlos (z. B. als Startguthaben, tägliche Aufladung oder als Belohnung für Abzeichen und
            Spielerfolge) oder durch den Kauf von Credit-Paketen (§ 7). Art und Höhe kostenloser Credits legen wir fest und dürfen
            sie für die Zukunft ändern; ein Anspruch darauf besteht nicht.
          </li>
          <li>
            Wie viele Credits eine Funktion kostet, zeigt der jeweilige Dienst vor der Nutzung an. Credits werden bei der Nutzung
            vom Guthaben abgebucht; ein negatives Guthaben ist nicht möglich. Alle Buchungen kannst du in deinem Konto einsehen.
          </li>
          <li>
            Fehlbuchungen (z. B. durch technische Fehler) dürfen wir berichtigen. Credits, die durch Manipulation, Ausnutzen von
            Fehlern oder andere Verstöße gegen diese Bedingungen erlangt wurden, dürfen wir zurückbuchen.
          </li>
          <li>
            Gekaufte Credits verfallen nicht, solange dein Konto besteht. Endet der Vertrag aus Gründen, die nicht du zu vertreten
            hast – insbesondere durch unsere ordentliche Kündigung oder die Einstellung aller Dienste, in denen Credits verwendet
            werden können –, erstatten wir dir den anteiligen Kaufpreis der noch nicht verbrauchten gekauften Credits. Kostenlos
            erhaltene Credits werden nicht erstattet.
          </li>
        </OL>
      </Section>

      <Section id="kauf" title="§ 7 Kauf von Credits">
        <OL>
          <li>
            Credit-Pakete kannst du in teilnehmenden Diensten (z. B. Saga) kaufen. Die Darstellung der Pakete ist kein bindendes
            Angebot. Durch Klick auf den Bestell-Button (z. B. „Jetzt kaufen“ oder „zahlungspflichtig bestellen“) gibst du ein
            verbindliches Angebot zum Kauf des gewählten Pakets ab. Der Vertrag kommt zustande, wenn wir das Angebot annehmen;
            spätestens mit der Gutschrift der Credits.
          </li>
          <li>
            Es gelten die beim Kauf angezeigten Preise. Sie sind Endpreise in Euro und enthalten die gesetzliche Umsatzsteuer.
          </li>
          <li>
            Die Zahlung wickelt der Zahlungsdienstleister Stripe (Stripe Payments Europe, Limited, Irland) ab; es stehen die dort
            angebotenen Zahlungsarten zur Verfügung, und es gelten ergänzend die Bedingungen von Stripe für die gewählte Zahlungsart.
            Die Credits schreiben wir deinem Konto gut, sobald Stripe uns die erfolgreiche Zahlung bestätigt.
          </li>
          <li>
            Wir speichern den Vertragstext (Paket, Preis, Zeitpunkt) und senden dir eine Bestätigung mit den Vertragsinhalten und
            dieser Widerrufsbelehrung per E-Mail. Die jeweils aktuellen Bedingungen kannst du jederzeit hier abrufen und speichern.
            Vertragssprache ist Deutsch.
          </li>
          <li>
            Wird eine Zahlung zurückgebucht oder nicht eingelöst, dürfen wir die damit erworbenen Credits zurückbuchen, soweit sie
            noch vorhanden sind, und den Anspruch im Übrigen geltend machen.
          </li>
        </OL>
      </Section>

      <Section id="widerruf" title="§ 8 Widerrufsbelehrung">
        <P>Verbrauchern steht beim Kauf von Credits ein Widerrufsrecht nach folgender Maßgabe zu:</P>
        <Box>
          <Sub title="Widerrufsrecht">
            <P>
              Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist
              beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.
            </P>
            <P>
              Um dein Widerrufsrecht auszuüben, musst du uns ({OPERATOR.company}, {OPERATOR.street}, {OPERATOR.zip}{" "}
              {OPERATOR.city}, Telefon {OPERATOR.phone}, E-Mail {OPERATOR.email}) mittels einer eindeutigen Erklärung (z. B. ein mit
              der Post versandter Brief oder eine E-Mail) über deinen Entschluss, diesen Vertrag zu widerrufen, informieren. Du kannst
              dafür das unten stehende Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.
            </P>
            <P>
              Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der
              Widerrufsfrist absendest.
            </P>
          </Sub>
          <Sub title="Folgen des Widerrufs">
            <P>
              Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und
              spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über deinen Widerruf dieses Vertrags
              bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der ursprünglichen
              Transaktion eingesetzt hast, es sei denn, mit dir wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden dir
              wegen dieser Rückzahlung Entgelte berechnet.
            </P>
          </Sub>
          <Sub title="Vorzeitiges Erlöschen des Widerrufsrechts">
            <P>
              Das Widerrufsrecht erlischt bei einem Vertrag über die Lieferung von nicht auf einem körperlichen Datenträger
              befindlichen digitalen Inhalten (hier: Gutschrift der Credits) vorzeitig, wenn wir mit der Ausführung des Vertrags
              begonnen haben, nachdem du (1) ausdrücklich zugestimmt hast, dass wir mit der Ausführung des Vertrags vor Ablauf der
              Widerrufsfrist beginnen, (2) deine Kenntnis davon bestätigt hast, dass du durch deine Zustimmung mit Beginn der
              Ausführung des Vertrags dein Widerrufsrecht verlierst, und (3) wir dir eine Bestätigung des Vertrags nach § 312f BGB
              zur Verfügung gestellt haben (§ 356 Abs. 5 BGB).
            </P>
          </Sub>
        </Box>
        <P>
          Die Zustimmung und Bestätigung nach Nr. (1) und (2) erteilst du vor dem Kauf ausdrücklich, indem du ein nicht
          vorausgewähltes Kästchen mit folgendem Text markierst: „Ich stimme ausdrücklich zu, dass ihr vor Ablauf der
          Widerrufsfrist mit der Ausführung des Vertrags beginnt und mir die Credits sofort gutschreibt. Mir ist bekannt, dass ich
          dadurch mein Widerrufsrecht verliere.“ Weil wir Credits sofort nach der Zahlung gutschreiben, ist ein Kauf nur mit
          dieser Zustimmung möglich. Die Bestätigung des Vertrags einschließlich deiner Zustimmung erhältst du per E-Mail.
        </P>
        <Sub title="Muster-Widerrufsformular">
          <P>(Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses Formular aus und sende es zurück.)</P>
          <div className="space-y-1 rounded-xl border border-border/70 px-4 py-3">
            <P>
              An {OPERATOR.company}, {OPERATOR.street}, {OPERATOR.zip} {OPERATOR.city}, E-Mail: {OPERATOR.email}:
            </P>
            <P>
              Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die
              Erbringung der folgenden Dienstleistung (*)
            </P>
            <P>– Bestellt am (*)/erhalten am (*)</P>
            <P>– Name des/der Verbraucher(s)</P>
            <P>– Anschrift des/der Verbraucher(s)</P>
            <P>– Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)</P>
            <P>– Datum</P>
            <P>(*) Unzutreffendes streichen.</P>
          </div>
        </Sub>
      </Section>

      <Section id="maengel" title="§ 9 Gewährleistung">
        <P>
          Für gekaufte Credits und die damit genutzten digitalen Leistungen gelten die gesetzlichen Vorschriften über Mängel an
          digitalen Produkten (§§ 327 ff. BGB). Für unentgeltlich bereitgestellte Dienste und Inhalte haften wir für Mängel nur
          nach § 10.
        </P>
      </Section>

      <Section id="haftung" title="§ 10 Haftung">
        <OL>
          <li>
            Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung von Leben, Körper oder Gesundheit,
            nach dem Produkthaftungsgesetz und im Umfang einer übernommenen Garantie.
          </li>
          <li>
            Bei einfacher Fahrlässigkeit haften wir im Zusammenhang mit kostenpflichtigen Leistungen nur für die Verletzung
            wesentlicher Vertragspflichten, also solcher Pflichten, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags
            überhaupt erst ermöglicht und auf deren Einhaltung du regelmäßig vertrauen darfst – und zwar begrenzt auf den
            vorhersehbaren, vertragstypischen Schaden.
          </li>
          <li>
            Soweit wir Dienste unentgeltlich bereitstellen, haften wir – außer in den Fällen des Absatzes 1 – nicht für einfache
            Fahrlässigkeit.
          </li>
          <li>
            Für den Verlust von Spielständen, Spielwelten, Gegenständen und anderen Spielwerten haften wir nur nach den Absätzen 1
            bis 3; lokale Spielstände auf deinem Gerät sicherst du selbst.
          </li>
          <li>Die Absätze 1 bis 4 gelten auch zugunsten unserer gesetzlichen Vertreter, Mitarbeiter und Erfüllungsgehilfen.</li>
        </OL>
      </Section>

      <Section id="laufzeit" title="§ 11 Laufzeit, Kündigung und Löschung des Kontos">
        <OL>
          <li>Der Nutzungsvertrag läuft auf unbestimmte Zeit.</li>
          <li>
            Du kannst ihn jederzeit ohne Frist beenden, indem du dein Konto löschst (unter „Mein Konto“ bzw. in den Einstellungen des
            Dienstes) oder uns die Kündigung in Textform mitteilst. Mit der Löschung deines Tretu-Kontos verfallen noch vorhandene
            Credits; darauf weisen wir dich vor der Löschung hin. Dein Widerrufsrecht nach § 8 und die Erstattung nach § 6 Abs. 7
            bleiben unberührt.
          </li>
          <li>
            Wir können den Vertrag mit einer Frist von vier Wochen ordentlich kündigen; § 6 Abs. 7 gilt. Konten, die seit mehr als
            zwei Jahren nicht genutzt wurden und kein gekauftes Guthaben enthalten, dürfen wir nach vorheriger Ankündigung per
            E-Mail mit einer Frist von vier Wochen löschen.
          </li>
          <li>
            Das Recht beider Seiten zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Ein wichtiger Grund liegt
            für uns insbesondere bei schweren oder trotz Abmahnung wiederholten Verstößen gegen diese Bedingungen vor. Bei Verstößen
            können wir – unter Berücksichtigung deiner berechtigten Interessen und der Schwere des Verstoßes – auch mildere Maßnahmen
            ergreifen, etwa Inhalte entfernen, Namen ändern, Funktionen einschränken oder dein Konto vorübergehend sperren.
          </li>
          <li>
            Nach Vertragsende löschen wir deine Daten nach Maßgabe der <A href="/datenschutz">Datenschutzerklärung</A>.
          </li>
        </OL>
      </Section>

      <Section id="dienste" title="§ 12 Besondere Bestimmungen für einzelne Dienste">
        <Sub title="Saga">
          <P>
            Saga erzählt Geschichten mit KI. Eingaben, die auf rechtswidrige Inhalte oder auf sexuelle Inhalte mit Minderjährigen
            zielen, sind verboten. Wir dürfen Eingaben und Ausgaben automatisch filtern. Für Kampagnen mit mehreren Spielern legt die
            Person, die die Kampagne erstellt, fest, wer teilnehmen darf.
          </P>
        </Sub>
        <Sub title="Tretu Play">
          <P>
            Einige Inhalte, insbesondere Punchline, enthalten derben Humor für Erwachsene. Die Karten von Punchline basieren teilweise
            auf dem Grundspiel von Cards Against Humanity und stehen unter der Lizenz CC BY-NC-SA 4.0; eigene Decks, die du teilst,
            dürfen Mitspieler und Freunde im Spiel verwenden. Roulette und andere Spiele mit Credits sind reine Unterhaltung ohne
            Einsatz von echtem Geld.
          </P>
        </Sub>
        <Sub title="Hollowmere">
          <P>
            Gold, Casino-Chips, Gegenstände, Wildlinge und alle anderen Werte im Spiel gibt es nur im Spiel und sind keine
            Tretu-Credits. Sie haben keinen realen Wert, können nicht mit echtem Geld gekauft und nicht ausgezahlt, verkauft oder
            außerhalb des Spiels getauscht werden. Das Casino im Spiel simuliert Glücksspiele mit Spielgeld und ist kein Glücksspiel.
            Im Koop entscheidet der Host, wer seiner Welt beitreten darf. KI-Helfer, die du mit einem Token verbindest, handeln in
            deinem Namen; Tokens kannst du jederzeit widerrufen.
          </P>
        </Sub>
        <Sub title="Minecraft-Server">
          <P>
            Es gelten die Server-Regeln im Spiel („/hilfe“) und im Dashboard. Spielzeit-Limits, Bonus-Aufgaben und Belohnungen sind
            freiwillige Angebote ohne Anspruch; abgehakte Aufgaben beruhen auf deiner Ehrlichkeit. Gegenstände, Bauwerke und
            Spielfortschritt auf dem Server haben keinen realen Wert. Die Nutzung des Minecraft-Clients unterliegt zusätzlich den
            Bedingungen von Mojang/Microsoft.
          </P>
        </Sub>
        <Sub title="Game-Server-Dashboard, TeamSpeak und Discord">
          <P>
            Das Game-Server-Dashboard steht nur Team-Mitgliedern mit der jeweiligen Rolle zur Verfügung. Auf TeamSpeak und Discord
            gelten die dort veröffentlichten Regeln; für Discord gelten zusätzlich die Bedingungen von Discord Inc.
          </P>
        </Sub>
      </Section>

      <Section id="aenderungen" title="§ 13 Änderungen dieser Bedingungen">
        <OL>
          <li>
            Wir dürfen diese Bedingungen mit Wirkung für die Zukunft ändern, wenn dafür ein triftiger Grund besteht, insbesondere bei
            neuen Funktionen, geänderter Rechtslage oder Rechtsprechung oder zur Schließung von Regelungslücken, und die Änderung
            dich nicht unangemessen benachteiligt.
          </li>
          <li>
            Über Änderungen informieren wir dich mindestens sechs Wochen vor ihrem Inkrafttreten per E-Mail oder im Dienst. Du kannst
            der Änderung bis zum Inkrafttreten widersprechen oder den Vertrag bis dahin kostenfrei kündigen. Widersprichst du nicht,
            gelten die geänderten Bedingungen als angenommen; darauf weisen wir dich in der Mitteilung gesondert hin.
          </li>
          <li>
            Änderungen, die das Verhältnis von Leistung und Gegenleistung wesentlich verschieben (z. B. am Wert bereits gekaufter
            Credits), nehmen wir nur mit deiner ausdrücklichen Zustimmung vor.
          </li>
        </OL>
      </Section>

      <Section id="schluss" title="§ 14 Streitbeilegung und Schlussbestimmungen">
        <OL>
          <li>
            Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
            teilzunehmen.
          </li>
          <li>
            Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Bist du Verbraucher mit gewöhnlichem
            Aufenthalt in einem anderen Staat, bleiben dir die zwingenden Verbraucherschutzvorschriften dieses Staates erhalten.
          </li>
          <li>
            Bist du Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist
            Gerichtsstand für alle Streitigkeiten Hamburg.
          </li>
          <li>Sollte eine Bestimmung dieser Bedingungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</li>
        </OL>
      </Section>
    </>
  );
}
