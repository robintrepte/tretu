import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { JsonLdWebPage } from "@/components/json-ld-webpage";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Datenschutz",
  description:
    "Datenschutzerklärung der Tretu Gaming Community. Informationen zur Verarbeitung personenbezogener Daten, DSGVO, Cookies und Ihre Rechte.",
  path: "/datenschutz",
  keywords: ["Datenschutz", "Datenschutzerklärung", "DSGVO", "Tretu", "Privacy"],
});

const DATENSCHUTZ_DESCRIPTION =
  "Datenschutzerklärung der Tretu Gaming Community. Informationen zur Verarbeitung personenbezogener Daten, DSGVO, Cookies und Ihre Rechte.";

function Section({
  title,
  children,
}: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--tretu-accent)] underline hover:no-underline"
    >
      {children}
    </a>
  );
}

export default function DatenschutzPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <JsonLdWebPage name="Datenschutz" description={DATENSCHUTZ_DESCRIPTION} path="/datenschutz" />
      <PageTitle title="Datenschutz" icon="datenschutz" />

      <div className="space-y-8">
        <P>
          Diese Datenschutzerklärung klärt Sie über die Art, den Umfang und Zweck der Verarbeitung
          von personenbezogenen Daten (nachfolgend kurz „Daten“) im Rahmen der Erbringung unserer
          Leistungen sowie innerhalb unseres Onlineangebotes und der mit ihm verbundenen Webseiten,
          Funktionen und Inhalte sowie externen Onlinepräsenzen, wie z.B. unser Social Media
          Profile auf (nachfolgend gemeinsam bezeichnet als „Onlineangebot“). Im Hinblick auf die
          verwendeten Begrifflichkeiten, wie z.B. „Verarbeitung“ oder „Verantwortlicher“ verweisen
          wir auf die Definitionen im Art. 4 der Datenschutzgrundverordnung (DSGVO).
        </P>

        <Section title="Verantwortlicher">
          <P>
            Tretu ist eine Marke der FollowerX GmbH, Bei St. Annen 2, 20457 Hamburg, Deutschland.
          </P>
          <P>
            Telefon: +49 160 4522230. E-Mail: business(at)tretu.de.{" "}
            <a href="/impressum/" className="text-[var(--tretu-accent)] underline hover:no-underline">
              Impressum
            </a>
          </P>
          <P>
            Hinweis: Um Spam-E-Mails zu vermeiden, haben wir das „@“ in unserer Mail-Adresse mit
            „(at)“ ersetzt. Bitte verwenden Sie stattdessen wieder das „@“, wenn Sie uns
            kontaktieren möchten.
          </P>
        </Section>

        <Section title="Arten der verarbeiteten Daten">
          <P>
            – Nutzungsdaten (z.B. besuchte Seiten, Zugriffszeiten). – Meta-/Kommunikationsdaten (z.B.
            IP-Adresse, Browsertyp, Referrer). – Kontaktdaten (z.B. E-Mail), sofern Sie uns
            kontaktieren.
          </P>
        </Section>

        <Section title="Kategorien betroffener Personen">
          <P>
            Besucher und Nutzer des Onlineangebotes (nachfolgend „Nutzer“).
          </P>
        </Section>

        <Section title="Zweck der Verarbeitung">
          <P>
            – Zurverfügungstellung des Onlineangebotes und seiner Funktionen. – Beantwortung von
            Kontaktanfragen. – Sicherheitsmaßnahmen (z.B. Erkennung von Missbrauch).
          </P>
        </Section>

        <Section title="Verwendete Begrifflichkeiten">
          <P>
            „Personenbezogene Daten“ sind alle Informationen, die sich auf eine identifizierte oder
            identifizierbare natürliche Person (im Folgenden „betroffene Person“) beziehen; als
            identifizierbar wird eine natürliche Person angesehen, die direkt oder indirekt,
            insbesondere mittels Zuordnung zu einer Kennung wie einem Namen, zu einer Kennnummer, zu
            Standortdaten, zu einer Online-Kennung (z.B. Cookie) oder zu einem oder mehreren
            besonderen Merkmalen identifiziert werden kann, die Ausdruck der physischen,
            physiologischen, genetischen, psychischen, wirtschaftlichen, kulturellen oder
            sozialen Identität dieser natürlichen Person sind.
          </P>
          <P>
            „Verarbeitung“ ist jeder mit oder ohne Hilfe automatisierter Verfahren ausgeführte
            Vorgang oder jede solche Vorgangsreihe im Zusammenhang mit personenbezogenen Daten.
            Der Begriff reicht weit und umfasst praktisch jeden Umgang mit Daten.
          </P>
          <P>
            „Pseudonymisierung“ die Verarbeitung personenbezogener Daten in einer Weise, dass die
            personenbezogenen Daten ohne Hinzuziehung zusätzlicher Informationen nicht mehr einer
            spezifischen betroffenen Person zugeordnet werden können, sofern diese zusätzlichen
            Informationen gesondert aufbewahrt werden und technischen und organisatorischen
            Maßnahmen unterliegen, die gewährleisten, dass die personenbezogenen Daten nicht einer
            identifizierten oder identifizierbaren natürlichen Person zugewiesen werden können.
          </P>
          <P>
            „Profiling“ jede Art der automatisierten Verarbeitung personenbezogener Daten, die
            darin besteht, dass diese personenbezogenen Daten verwendet werden, um bestimmte
            persönliche Aspekte, die sich auf eine natürliche Person beziehen, zu bewerten.
          </P>
          <P>
            Als „Verantwortlicher“ wird die natürliche oder juristische Person, Behörde, Einrichtung
            oder andere Stelle, die allein oder gemeinsam mit anderen über die Zwecke und Mittel
            der Verarbeitung von personenbezogenen Daten entscheidet, bezeichnet.
          </P>
          <P>
            „Auftragsverarbeiter“ eine natürliche oder juristische Person, Behörde, Einrichtung oder
            andere Stelle, die personenbezogene Daten im Auftrag des Verantwortlichen verarbeitet.
          </P>
        </Section>

        <Section title="Maßgebliche Rechtsgrundlagen">
          <P>
            Nach Maßgabe des Art. 13 DSGVO teilen wir Ihnen die Rechtsgrundlagen unserer
            Datenverarbeitungen mit. Für Nutzer aus dem Geltungsbereich der DSGVO gilt: Die
            Rechtsgrundlage für die Einholung von Einwilligungen ist Art. 6 Abs. 1 lit. a und Art. 7
            DSGVO; für die Verarbeitung zur Erfüllung unserer Leistungen und Durchführung
            vertraglicher Maßnahmen sowie Beantwortung von Anfragen ist Art. 6 Abs. 1 lit. b DSGVO;
            für die Verarbeitung zur Erfüllung unserer rechtlichen Verpflichtungen ist Art. 6 Abs.
            1 lit. c DSGVO; für lebenswichtige Interessen Art. 6 Abs. 1 lit. d DSGVO; für die
            Wahrnehmung einer Aufgabe im öffentlichen Interesse Art. 6 Abs. 1 lit. e DSGVO; für
            die Verarbeitung zur Wahrung unserer berechtigten Interessen ist Art. 6 Abs. 1 lit. f
            DSGVO. Die Verarbeitung von Daten zu anderen Zwecken bestimmt sich nach Art. 6 Abs. 4
            DSGVO. Die Verarbeitung von besonderen Kategorien von Daten bestimmt sich nach Art. 9
            Abs. 2 DSGVO.
          </P>
        </Section>

        <Section title="Sicherheitsmaßnahmen">
          <P>
            Wir treffen nach Maßgabe der gesetzlichen Vorgaben unter Berücksichtigung des Stands der
            Technik geeignete technische und organisatorische Maßnahmen, um ein dem Risiko
            angemessenes Schutzniveau zu gewährleisten. Zu den Maßnahmen gehören insbesondere die
            Sicherung der Vertraulichkeit, Integrität und Verfügbarkeit von Daten sowie Verfahren
            zur Wahrnehmung von Betroffenenrechten und Reaktion auf Gefährdungen.
          </P>
        </Section>

        <Section title="Zusammenarbeit mit Auftragsverarbeitern, gemeinsam Verantwortlichen und Dritten">
          <P>
            Sofern wir Daten gegenüber anderen Personen und Unternehmen offenbaren, erfolgt dies
            nur auf Grundlage einer gesetzlichen Erlaubnis, Nutzer eingewilligt haben, eine
            rechtliche Verpflichtung dies vorsieht oder auf Grundlage unserer berechtigten
            Interessen.
          </P>
        </Section>

        <Section title="Übermittlungen in Drittländer">
          <P>
            Sofern wir Daten in einem Drittland verarbeiten, erfolgt dies nur, wenn es zur
            Erfüllung unserer (vor)vertraglichen Pflichten, auf Grundlage Ihrer Einwilligung,
            aufgrund einer rechtlichen Verpflichtung oder auf Grundlage unserer berechtigten
            Interessen geschieht. Wir verarbeiten Daten nur in Drittländern mit anerkanntem
            Datenschutzniveau oder auf Grundlage besonderer Garantien (Art. 44 bis 49 DSGVO).{" "}
            <A href="https://ec.europa.eu/info/law/law-topic/data-protection/data-transfers-outside-eu_de">
              Informationsseite der EU-Kommission
            </A>
            .
          </P>
        </Section>

        <Section title="Rechte der betroffenen Personen">
          <P>Sie haben das Recht auf Bestätigung, Auskunft, Kopie der Daten entsprechend den gesetzlichen Vorgaben.</P>
          <P>Sie haben das Recht auf Vervollständigung oder Berichtigung der Sie betreffenden Daten.</P>
          <P>Sie haben das Recht zu verlangen, dass betreffende Daten gelöscht werden bzw. die Verarbeitung eingeschränkt wird.</P>
          <P>Sie haben das Recht auf Datenübertragbarkeit.</P>
          <P>Sie haben das Recht, eine Beschwerde bei der zuständigen Aufsichtsbehörde einzureichen.</P>
        </Section>

        <Section title="Widerrufsrecht">
          <P>Sie haben das Recht, erteilte Einwilligungen mit Wirkung für die Zukunft zu widerrufen.</P>
        </Section>

        <Section title="Widerspruchsrecht">
          <P>
            Sie können der künftigen Verarbeitung der Sie betreffenden Daten jederzeit widersprechen.
            Der Widerspruch kann insbesondere gegen die Verarbeitung für Zwecke der Direktwerbung
            erfolgen.
          </P>
        </Section>

        <Section title="Cookies und lokale Speicherung">
          <P>
            Wir setzen keine Werbe- oder Marketing-Cookies ein. Technisch notwendige Speicherung
            (z.B. Ihre Theme-Einstellung) kann lokal im Browser erfolgen. Sie können Cookies und
            lokale Speicher in den Einstellungen Ihres Browsers verwalten oder deaktivieren.
          </P>
        </Section>

        <Section title="Löschung von Daten">
          <P>
            Die von uns verarbeiteten Daten werden nach Maßgabe der gesetzlichen Vorgaben gelöscht
            oder in ihrer Verarbeitung eingeschränkt. Sofern nicht ausdrücklich angegeben, werden
            die bei uns gespeicherten Daten gelöscht, sobald sie für ihre Zweckbestimmung nicht
            mehr erforderlich sind und der Löschung keine gesetzlichen Aufbewahrungspflichten
            entgegenstehen.
          </P>
        </Section>

        <Section title="Änderungen und Aktualisierungen der Datenschutzerklärung">
          <P>
            Wir bitten Sie sich regelmäßig über den Inhalt unserer Datenschutzerklärung zu
            informieren. Wir passen die Datenschutzerklärung an, sobald die Änderungen der von uns
            durchgeführten Datenverarbeitungen dies erforderlich machen.
          </P>
        </Section>

        <Section title="Kontaktaufnahme">
          <P>
            Bei der Kontaktaufnahme mit uns werden die Angaben des Nutzers zur Bearbeitung der
            Kontaktanfrage gem. Art. 6 Abs. 1 lit. b. bzw. lit. f. DSGVO verarbeitet. Wir löschen
            die Anfragen, sofern diese nicht mehr erforderlich sind.
          </P>
        </Section>

        <Section title="Hosting und E-Mail-Versand">
          <P>
            Die Hosting-Leistungen dienen der Zurverfügungstellung von Infrastruktur,
            Plattformdienstleistungen, Rechenkapazität, Speicherplatz und Datenbankdiensten. Die
            Verarbeitung erfolgt auf Grundlage unserer berechtigten Interessen gem. Art. 6 Abs. 1
            lit. f DSGVO i.V.m. Art. 28 DSGVO.
          </P>
        </Section>

        <Section title="Erhebung von Zugriffsdaten und Logfiles">
          <P>
            Wir erheben auf Grundlage unserer berechtigten Interessen (Art. 6 Abs. 1 lit. f. DSGVO)
            Daten über jeden Zugriff auf den Server (Serverlogfiles). Dazu gehören u.a. abgerufene
            Seite, Datum und Uhrzeit, übertragene Datenmenge, Browsertyp, Betriebssystem, Referrer,
            IP-Adresse und anfragender Provider. Logfiles werden aus Sicherheitsgründen für maximal
            7 Tage gespeichert.
          </P>
        </Section>

        <Section title="Einbindung von Diensten Dritter">
          <P>
            Unsere Seiten können Inhalte Dritter einbinden (z.B. YouTube, Twitch, Discord,
            Teamspeak-Anzeigen). Beim Aufruf von Seiten mit solchen Inhalten können die jeweiligen
            Anbieter personenbezogene Daten erheben. Wir haben darauf keinen Einfluss. Maßgeblich
            sind die Datenschutzerklärungen der Anbieter (z.B. Google/YouTube, Twitch, Discord).
          </P>
        </Section>
      </div>
    </div>
  );
}
