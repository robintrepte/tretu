import type { Metadata } from "next";
import { PageTitle } from "@/components/page-title";
import { JsonLdWebPage } from "@/components/json-ld-webpage";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Impressum",
  description:
    "Impressum der Tretu Gaming Community. Angaben gemäß § 5 TMG: FollowerX GmbH, Hamburg. Kontakt und rechtliche Informationen.",
  path: "/impressum",
  keywords: ["Impressum", "Tretu", "FollowerX", "Kontakt", "Rechtliches"],
});

const IMPRESSUM_DESCRIPTION =
  "Impressum der Tretu Gaming Community. Angaben gemäß § 5 TMG: FollowerX GmbH, Hamburg. Kontakt und rechtliche Informationen.";

export default function ImpressumPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 md:px-6 lg:px-8">
      <JsonLdWebPage name="Impressum" description={IMPRESSUM_DESCRIPTION} path="/impressum" />
      <PageTitle title="Impressum" icon="impressum" />

      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">
            Angaben gemäß § 5 TMG:
          </h2>
          <p className="mt-2 text-muted-foreground">
            <em>Tretu ist eine Marke der</em>
            <br />
            FollowerX GmbH
            <br />
            Bei St. Annen 2
            <br />
            20457 Hamburg
            <br />
            Deutschland
          </p>
          <p className="mt-2 text-muted-foreground">
            Registergericht: Hamburg
            <br />
            Registernummer: HRB 166452
            <br />
            Vertretungsberechtigte Geschäftsführer: Robin Trepte & Lukas Tumpak
            <br />
            Umsatzsteuer-Identifikationsnummer nach § 27a UStG: DE343792884
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            Inhaltlich Verantwortlicher gem. § 55 RStV
          </h2>
          <p className="mt-2 text-muted-foreground">Robin Trepte, Lukas Tumpak</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Kontakt:</h2>
          <p className="mt-2 text-muted-foreground">
            Telefon: +49 160 4522230
            <br />
            E-Mail: business(at)tretu.de
          </p>
          <p className="mt-2 text-sm italic text-muted-foreground">
            Hinweis: Um Spam-E-Mails zu vermeiden, haben wir das „@“ in unserer Mail-Adresse mit
            „(at)“ ersetzt. Bitte verwenden Sie stattdessen wieder das „@“, wenn Sie uns
            kontaktieren möchten.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            Hinweis auf EU-Streitschlichtung
          </h2>
          <p className="mt-2 text-muted-foreground">
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS)
            bereit:{" "}
            <a
              href="https://ec.europa.eu/consumers/odr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--tretu-accent)] underline hover:no-underline"
            >
              https://ec.europa.eu/consumers/odr
            </a>
            . Unsere E-Mail-Adresse finden Sie oben im Impressum.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">
            Haftungsausschluss (Disclaimer)
          </h2>

          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Haftung für Inhalte
          </h3>
          <p className="mt-2 text-muted-foreground">
            Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten
            nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als
            Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
            Informationen zu überwachen oder nach Umständen zu forschen, die auf eine
            rechtswidrige Tätigkeit hinweisen.
          </p>
          <p className="mt-2 text-muted-foreground">
            Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den
            allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch
            erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei
            Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend
            entfernen.
          </p>

          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Haftung für Links
          </h3>
          <p className="mt-2 text-muted-foreground">
            Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen
            Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr
            übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder
            Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der
            Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum
            Zeitpunkt der Verlinkung nicht erkennbar.
          </p>
          <p className="mt-2 text-muted-foreground">
            Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete
            Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von
            Rechtsverletzungen werden wir derartige Links umgehend entfernen.
          </p>

          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Urheberrecht
          </h3>
          <p className="mt-2 text-muted-foreground">
            Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen
            dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art
            der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen
            Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite
            sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.
          </p>
          <p className="mt-2 text-muted-foreground">
            Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die
            Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche
            gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden,
            bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden von Rechtsverletzungen
            werden wir derartige Inhalte umgehend entfernen.
          </p>
        </section>
      </div>
    </div>
  );
}
