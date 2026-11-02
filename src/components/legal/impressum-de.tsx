import { A, P, Section } from "@/components/legal/legal-page";
import { OPERATOR, SERVICES } from "@/components/legal/operator";

export function ImpressumDe() {
  return (
    <>
      <Section title="Angaben gemäß § 5 DDG">
        <P>
          {OPERATOR.brand} ist eine Marke der
          <br />
          <strong className="text-foreground">{OPERATOR.company}</strong>
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.zip} {OPERATOR.city}
          <br />
          {OPERATOR.country.de}
        </P>
        <P>
          Vertreten durch die Geschäftsführer: {OPERATOR.managingDirectors}
          <br />
          Registergericht: {OPERATOR.registerCourt.de}
          <br />
          Registernummer: {OPERATOR.registerNumber}
          <br />
          Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: {OPERATOR.vatId}
        </P>
      </Section>

      <Section title="Kontakt">
        <P>
          Telefon: {OPERATOR.phone}
          <br />
          E-Mail: {OPERATOR.emailObfuscated}
        </P>
        <P>
          Zum Schutz vor Spam haben wir das „@“ in der E-Mail-Adresse durch „(at)“ ersetzt. Bitte verwende beim Schreiben
          wieder das „@“.
        </P>
      </Section>

      <Section title="Geltungsbereich">
        <P>
          Dieses Impressum gilt für tretu.de und für alle Dienste der Marke {OPERATOR.brand}, insbesondere das Tretu-Konto (
          {SERVICES.auth}), Saga ({SERVICES.saga}), Tretu Play ({SERVICES.play}), Hollowmere ({SERVICES.hollowmere} sowie die
          Spiel-Apps), den Minecraft-Server mit Dashboard ({SERVICES.minecraft}), unsere Statusseite ({SERVICES.status}) sowie
          unsere Community-Server auf TeamSpeak und Discord und unsere Profile in
          sozialen Netzwerken.
        </P>
      </Section>

      <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <P>{OPERATOR.responsibleForContent}, Anschrift wie oben</P>
      </Section>

      <Section title="Verbraucherstreitbeilegung">
        <P>
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen.
        </P>
      </Section>

      <Section title="Haftung für Inhalte">
        <P>
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Für
          fremde Informationen, die wir übermitteln oder speichern, sind wir nach §§ 7 bis 10 DDG nicht verpflichtet, diese zu
          überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur
          Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben unberührt. Eine
          diesbezügliche Haftung ist erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich; sobald wir
          davon erfahren, entfernen wir die betroffenen Inhalte umgehend.
        </P>
        <P>
          Inhalte, die Nutzer selbst erstellen – etwa Anzeigenamen, Profile, Chat-Nachrichten, eigene Karten, Welten und
          Charaktere –, sowie Texte, Bilder und Töne, die in Saga und anderen Diensten automatisiert durch künstliche
          Intelligenz auf Grundlage von Nutzereingaben erzeugt werden, geben nicht die Meinung des Betreibers wieder.
        </P>
        <P>
          Rechtswidrige Inhalte kannst du uns jederzeit über die oben genannten Kontaktdaten melden. Bitte nenne dabei den
          genauen Ort (Adresse der Seite, Spiel oder Server) und begründe kurz, warum der Inhalt rechtswidrig ist.
        </P>
      </Section>

      <Section title="Haftung für Links">
        <P>
          Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für diese
          fremden Inhalte ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Die verlinkten Seiten haben wir zum
          Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren nicht erkennbar. Eine
          ständige inhaltliche Kontrolle ist ohne konkrete Anhaltspunkte nicht zumutbar. Bei Bekanntwerden von
          Rechtsverletzungen entfernen wir derartige Links umgehend.
        </P>
      </Section>

      <Section title="Urheberrecht">
        <P>
          Die durch den Betreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die
          Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen
          der schriftlichen Zustimmung des Betreibers. Downloads und Kopien dieser Seiten sind nur für den privaten, nicht
          kommerziellen Gebrauch gestattet. Inhalte Dritter sind als solche gekennzeichnet. Solltest du dennoch auf eine
          Urheberrechtsverletzung aufmerksam werden, bitten wir um einen Hinweis; bei Bekanntwerden von Rechtsverletzungen
          entfernen wir derartige Inhalte umgehend.
        </P>
        <P>
          Die Karten von Punchline in Tretu Play basieren teilweise auf dem Grundspiel von Cards Against Humanity (© Cards
          Against Humanity LLC) und stehen unter der Lizenz{" "}
          <A href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de">CC BY-NC-SA 4.0</A>. Tretu Play steht in keiner
          Verbindung zu Cards Against Humanity LLC. Minecraft ist eine Marke von Mojang Synergies AB; der Tretu-Minecraft-Server
          ist kein offizielles Minecraft-Produkt und weder von Mojang noch von Microsoft genehmigt oder mit ihnen verbunden.
        </P>
      </Section>

      <Section title="Weitere Informationen">
        <P>
          Wie wir mit personenbezogenen Daten umgehen, erklärt unsere <A href="/datenschutz">Datenschutzerklärung</A>. Die
          Bedingungen für die Nutzung unserer Dienste und der Tretu-Credits findest du in unseren <A href="/agb">AGB</A>.
        </P>
      </Section>
    </>
  );
}
