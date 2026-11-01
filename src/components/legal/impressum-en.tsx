import { A, P, Section } from "@/components/legal/legal-page";
import { OPERATOR, SERVICES } from "@/components/legal/operator";

export function ImpressumEn() {
  return (
    <>
      <Section title="Information pursuant to § 5 DDG (German Digital Services Act)">
        <P>
          {OPERATOR.brand} is a brand of
          <br />
          <strong className="text-foreground">{OPERATOR.company}</strong>
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.zip} {OPERATOR.city}
          <br />
          {OPERATOR.country.en}
        </P>
        <P>
          Represented by the managing directors: {OPERATOR.managingDirectors}
          <br />
          Register court: {OPERATOR.registerCourt.en}
          <br />
          Register number: {OPERATOR.registerNumber}
          <br />
          VAT identification number pursuant to § 27a of the German VAT Act (UStG): {OPERATOR.vatId}
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Phone: {OPERATOR.phone}
          <br />
          Email: {OPERATOR.emailObfuscated}
        </P>
        <P>To protect against spam, the “@” in the email address is replaced by “(at)”. Please use “@” when writing to us.</P>
      </Section>

      <Section title="Scope">
        <P>
          This legal notice applies to tretu.de and to all services of the {OPERATOR.brand} brand, in particular the Tretu
          account ({SERVICES.auth}), Saga ({SERVICES.saga}), Tretu Play ({SERVICES.play}), Hollowmere ({SERVICES.hollowmere} and
          the game apps), the Minecraft server with its dashboard ({SERVICES.minecraft}), our statistics and status pages (
          {SERVICES.stats}, {SERVICES.status}), our community servers on TeamSpeak and Discord and our social media profiles.
        </P>
      </Section>

      <Section title="Responsible for content pursuant to § 18 (2) MStV (German Interstate Media Treaty)">
        <P>{OPERATOR.responsibleForContent}, address as above</P>
      </Section>

      <Section title="Consumer dispute resolution">
        <P>We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</P>
      </Section>

      <Section title="Liability for content">
        <P>
          As a service provider, we are responsible for our own content on these pages under general law. Under §§ 7 to 10 DDG,
          we are not obliged to monitor third-party information that we transmit or store, or to look for circumstances that
          indicate illegal activity. Obligations to remove or block the use of information under general law remain unaffected.
          Liability in this respect is only possible from the moment we become aware of a specific infringement; as soon as we
          do, we remove the content concerned without delay.
        </P>
        <P>
          Content that users create themselves – such as display names, profiles, chat messages, their own cards, worlds and
          characters – as well as texts, images and sounds that Saga and other services generate automatically with artificial
          intelligence based on user input do not reflect the opinion of the operator.
        </P>
        <P>
          You can report illegal content to us at any time using the contact details above. Please state the exact location
          (address of the page, game or server) and briefly explain why the content is illegal.
        </P>
      </Section>

      <Section title="Liability for links">
        <P>
          Our services contain links to external third-party websites whose content we have no influence over. The respective
          provider or operator is always responsible for that content. We checked the linked pages for possible legal
          violations when we linked them; no illegal content was apparent. Permanent monitoring is not reasonable without
          concrete evidence of an infringement. As soon as we become aware of an infringement, we remove such links without
          delay.
        </P>
      </Section>

      <Section title="Copyright">
        <P>
          The content and works created by the operator on these pages are subject to German copyright law. Reproduction,
          editing, distribution and any kind of use beyond the limits of copyright law require the operator’s written consent.
          Downloads and copies of these pages are only permitted for private, non-commercial use. Third-party content is marked
          as such. If you nevertheless notice a copyright infringement, please let us know; as soon as we become aware of an
          infringement, we remove such content without delay.
        </P>
        <P>
          Some Punchline cards in Tretu Play are based on the base game of Cards Against Humanity (© Cards Against Humanity LLC)
          and are licensed under <A href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</A>. Tretu Play is
          not affiliated with Cards Against Humanity LLC. Minecraft is a trademark of Mojang Synergies AB; the Tretu Minecraft
          server is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft.
        </P>
      </Section>

      <Section title="More information">
        <P>
          How we handle personal data is explained in our <A href="/datenschutz">privacy policy</A>. The terms for using our
          services and Tretu Credits are set out in our <A href="/agb">terms</A>.
        </P>
      </Section>
    </>
  );
}
