import { A, Box, OL, P, Section, Sub, UL } from "@/components/legal/legal-page";
import { OPERATOR, SERVICES } from "@/components/legal/operator";

export const AGB_TOC_EN = [
  { id: "geltung", title: "Scope and provider" },
  { id: "konto", title: "Tretu account and conclusion of contract" },
  { id: "leistungen", title: "Services and availability" },
  { id: "regeln", title: "Rules of conduct" },
  { id: "inhalte", title: "User content and AI content" },
  { id: "credits", title: "Tretu Credits" },
  { id: "kauf", title: "Buying credits" },
  { id: "widerruf", title: "Right of withdrawal" },
  { id: "maengel", title: "Warranty" },
  { id: "haftung", title: "Liability" },
  { id: "laufzeit", title: "Term, termination and deleting your account" },
  { id: "dienste", title: "Special provisions for individual services" },
  { id: "aenderungen", title: "Changes to these terms" },
  { id: "schluss", title: "Dispute resolution and final provisions" },
];

export function AgbEn() {
  return (
    <>
      <Section id="geltung" title="§ 1 Scope and provider">
        <OL>
          <li>
            These general terms and conditions of use (“terms”) apply to the use of all services of the {OPERATOR.brand} brand,
            in particular {SERVICES.hub} with the Tretu platform, the Tretu account ({SERVICES.auth}), Saga ({SERVICES.saga}), Tretu
            Play ({SERVICES.play}), Hollowmere ({SERVICES.hollowmere} and game apps), the Minecraft server with its dashboard (
            {SERVICES.minecraft}) and our TeamSpeak and Discord servers (together “services”), and to Tretu Credits.
          </li>
          <li>
            The provider and your contractual partner is {OPERATOR.company}, {OPERATOR.street}, {OPERATOR.zip} {OPERATOR.city},
            Germany (“we”, “us”). {OPERATOR.brand} is a brand of {OPERATOR.company}. Further details are in the{" "}
            <A href="/impressum">legal notice</A>.
          </li>
          <li>
            A consumer within the meaning of these terms is any natural person who enters into a legal transaction for purposes
            that are predominantly outside their trade, business or profession (§ 13 German Civil Code, BGB).
          </li>
          <li>
            Users’ own terms do not apply, even if we do not expressly object to them. The special provisions for individual
            services in § 12 apply in addition; in case of conflict they take precedence over these general rules.
          </li>
          <li>
            How we handle personal data is set out in our <A href="/datenschutz">privacy policy</A>.
          </li>
        </OL>
      </Section>

      <Section id="konto" title="§ 2 Tretu account and conclusion of contract">
        <OL>
          <li>
            You can use many services without an account or as a guest. Other features require an account – a Tretu account or an
            account in the respective service. Registering or signing in for the first time concludes a free contract of use under
            these terms.
          </li>
          <li>
            Your details must be accurate; you must keep your credentials secret and protect them from access by third parties. One
            Tretu account per person. Accounts cannot be transferred.
          </li>
          <li>
            You must be at least 16 years old. If you are younger, you need the permission of your parents or legal guardians. Only
            people with full legal capacity or with the permission of their legal guardians may buy credits.
          </li>
          <li>
            There is no right to conclude a contract of use. We may refuse a registration, in particular if a previous account was
            blocked for violations.
          </li>
        </OL>
      </Section>

      <Section id="leistungen" title="§ 3 Services and availability">
        <OL>
          <li>
            The services are generally free of charge. Only buying credit packages is subject to a charge (§ 7); the respective
            service shows which features use credits before you use them.
          </li>
          <li>
            We aim for smooth operation but cannot guarantee constant availability. Maintenance, security incidents, disruptions at
            third parties (e.g. AI providers, payment service providers, Discord) or force majeure may temporarily restrict use.
          </li>
          <li>
            We keep developing the services and may change, extend or discontinue games and features where this is reasonable for
            you, taking your interests into account, in particular if technical or legal conditions change. If we discontinue a
            service in which purchased credits can be used, we will inform you at least six weeks in advance; § 6(7) applies to
            purchased credits that can then no longer be used.
          </li>
        </OL>
      </Section>

      <Section id="regeln" title="§ 4 Rules of conduct">
        <P>Please treat others fairly and with respect. In particular, you must not:</P>
        <UL>
          <li>
            use or generate offensive, discriminatory, violence-glorifying, sexually explicit or otherwise unlawful names, profile
            pictures, messages or content,
          </li>
          <li>harass, threaten or deceive others or impersonate someone else – including a team member,</li>
          <li>publish other people’s personal data without their consent,</li>
          <li>
            cheat, exploit bugs or manipulate games, leaderboards, statistics or credits using scripts, bots, multiple accounts or
            other illegitimate means,
          </li>
          <li>
            attack, overload or scrape the services or circumvent security measures, unless we expressly allow it (e.g. via a
            documented API),
          </li>
          <li>distribute advertising or spam or use the services commercially without our consent.</li>
        </UL>
        <P>
          On our community servers (Minecraft, TeamSpeak, Discord) the server rules published there and the instructions of the
          moderators also apply.
        </P>
      </Section>

      <Section id="inhalte" title="§ 5 User content and AI content">
        <OL>
          <li>
            You are responsible for content you post or have generated (e.g. names, profiles, messages, characters, worlds, your own
            cards and decks, builds). You warrant that you hold the necessary rights and that the content does not violate laws or
            third-party rights.
          </li>
          <li>
            You grant us the simple, free right, limited to the duration of storage, to store this content, process it technically
            and display it within the services – depending on the visibility settings, only to you, your co-players and friends or
            publicly. We do not receive any further rights.
          </li>
          <li>
            Some services, in particular Saga, generate text, images, music and speech automatically using artificial intelligence.
            This content is created without human review, may be inaccurate, inappropriate or similar to other content and does not
            represent our opinion or recommendation. It is meant for entertainment; do not rely on it for real-world decisions (e.g.
            on health, law or finance). To the extent rights arise in such content, you may use it for private, non-commercial
            purposes.
          </li>
          <li>
            We may remove or block content that violates these terms or the law and change names. You can report illegal content to
            us at any time (contact details in the legal notice).
          </li>
        </OL>
      </Section>

      <Section id="credits" title="§ 6 Tretu Credits">
        <OL>
          <li>
            Tretu Credits (“credits”, abbreviation “TC”) are a virtual unit of account that lets you use certain features in our
            services (e.g. AI narration and images in Saga). Your credits account is tied to your Tretu account and is the same in
            all participating services.
          </li>
          <li>
            <strong className="text-foreground">Credits have no cash value.</strong> They are not money or e-money, bear no
            interest and cannot be paid out, exchanged for money or other assets or sold.
          </li>
          <li>
            <strong className="text-foreground">Credits are not transferable</strong> – neither to other accounts nor to other
            people – and must not be traded outside our services.
          </li>
          <li>
            You receive credits free of charge (e.g. as a welcome bonus, daily top-up or as a reward for badges and game
            achievements) or by buying credit packages (§ 7). We determine the type and amount of free credits and may change them
            for the future; there is no entitlement to them.
          </li>
          <li>
            The respective service shows how many credits a feature costs before you use it. Credits are deducted from your balance
            when used; a negative balance is not possible. You can see all transactions in your account.
          </li>
          <li>
            We may correct incorrect bookings (e.g. caused by technical errors). We may reverse credits obtained through
            manipulation, exploiting bugs or other violations of these terms.
          </li>
          <li>
            Purchased credits do not expire as long as your account exists. If the contract ends for reasons you are not
            responsible for – in particular through our ordinary termination or the discontinuation of all services in which
            credits can be used – we will refund the proportionate purchase price of purchased credits not yet used. Credits
            received free of charge are not refunded.
          </li>
        </OL>
      </Section>

      <Section id="kauf" title="§ 7 Buying credits">
        <OL>
          <li>
            You can buy credit packages in participating services (e.g. Saga). The presentation of the packages is not a binding
            offer. By clicking the order button (e.g. “Buy now” or “Order with obligation to pay”) you make a binding offer to buy
            the selected package. The contract is concluded when we accept the offer, at the latest when the credits are added to
            your account.
          </li>
          <li>The prices shown at checkout apply. They are final prices in euros and include statutory VAT.</li>
          <li>
            Payment is processed by the payment service provider Stripe (Stripe Payments Europe, Limited, Ireland); the payment
            methods offered there are available, and Stripe’s terms for the chosen payment method apply in addition. We add the
            credits to your account as soon as Stripe confirms the successful payment.
          </li>
          <li>
            We store the contract text (package, price, time) and send you a confirmation with the contract details and this
            withdrawal information by email. You can access and save the current terms here at any time. The language of the
            contract is German.
          </li>
          <li>
            If a payment is charged back or not honoured, we may reverse the credits acquired with it, to the extent they are still
            available, and otherwise assert our claim.
          </li>
        </OL>
      </Section>

      <Section id="widerruf" title="§ 8 Right of withdrawal">
        <P>Consumers have a right of withdrawal when buying credits as follows:</P>
        <Box>
          <Sub title="Right of withdrawal">
            <P>
              You have the right to withdraw from this contract within fourteen days without giving any reason. The withdrawal
              period is fourteen days from the day the contract is concluded.
            </P>
            <P>
              To exercise your right of withdrawal, you must inform us ({OPERATOR.company}, {OPERATOR.street}, {OPERATOR.zip}{" "}
              {OPERATOR.city}, Germany, phone {OPERATOR.phone}, email {OPERATOR.email}) of your decision to withdraw from this
              contract by an unequivocal statement (e.g. a letter sent by post or an email). You may use the model withdrawal form
              below, but it is not obligatory.
            </P>
            <P>
              To meet the withdrawal deadline, it is sufficient for you to send your communication concerning your exercise of the
              right of withdrawal before the withdrawal period has expired.
            </P>
          </Sub>
          <Sub title="Effects of withdrawal">
            <P>
              If you withdraw from this contract, we shall reimburse all payments received from you without undue delay and in any
              event not later than fourteen days from the day on which we are informed about your decision to withdraw from this
              contract. We will carry out such reimbursement using the same means of payment as you used for the initial
              transaction, unless you have expressly agreed otherwise; in any event, you will not incur any fees as a result of such
              reimbursement.
            </P>
          </Sub>
          <Sub title="Early expiry of the right of withdrawal">
            <P>
              For a contract for the supply of digital content not supplied on a tangible medium (here: crediting the credits), the
              right of withdrawal expires early if we have begun performing the contract after you (1) have expressly consented to
              us beginning performance before the end of the withdrawal period, (2) have acknowledged that you lose your right of
              withdrawal by giving this consent once performance has begun, and (3) we have provided you with a confirmation of the
              contract in accordance with § 312f BGB (§ 356(5) BGB).
            </P>
          </Sub>
        </Box>
        <P>
          You give the consent and acknowledgement under (1) and (2) expressly before buying by ticking a box that is not
          pre-ticked, with the following text: “I expressly agree that you begin performing the contract before the end of the
          withdrawal period and credit the credits to my account immediately. I am aware that I thereby lose my right of
          withdrawal.” Because credits are added immediately after payment, a purchase is only possible with this consent. You
          receive the contract confirmation, including your consent, by e-mail.
        </P>
        <Sub title="Model withdrawal form">
          <P>(Complete and return this form only if you wish to withdraw from the contract.)</P>
          <div className="space-y-1 rounded-xl border border-border/70 px-4 py-3">
            <P>
              To {OPERATOR.company}, {OPERATOR.street}, {OPERATOR.zip} {OPERATOR.city}, Germany, email: {OPERATOR.email}:
            </P>
            <P>
              I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract of sale of the following goods (*)/for the
              provision of the following service (*)
            </P>
            <P>– Ordered on (*)/received on (*)</P>
            <P>– Name of consumer(s)</P>
            <P>– Address of consumer(s)</P>
            <P>– Signature of consumer(s) (only if this form is notified on paper)</P>
            <P>– Date</P>
            <P>(*) Delete as appropriate.</P>
          </div>
        </Sub>
      </Section>

      <Section id="maengel" title="§ 9 Warranty">
        <P>
          The statutory provisions on defects in digital products (§§ 327 et seq. BGB) apply to purchased credits and the digital
          services used with them. For services and content provided free of charge, we are liable for defects only in accordance
          with § 10.
        </P>
      </Section>

      <Section id="haftung" title="§ 10 Liability">
        <OL>
          <li>
            We are liable without limitation for intent and gross negligence, for injury to life, body or health, under the German
            Product Liability Act and to the extent of any guarantee given.
          </li>
          <li>
            In the case of simple negligence in connection with paid services, we are only liable for breaches of essential
            contractual obligations, i.e. obligations whose fulfilment makes the proper performance of the contract possible in the
            first place and on whose observance you may regularly rely – limited to the foreseeable damage typical for the contract.
          </li>
          <li>
            Where we provide services free of charge, we are not liable for simple negligence, except in the cases of paragraph 1.
          </li>
          <li>
            We are liable for the loss of saves, game worlds, items and other in-game values only in accordance with paragraphs 1 to
            3; you back up local saves on your device yourself.
          </li>
          <li>Paragraphs 1 to 4 also apply in favour of our legal representatives, employees and vicarious agents.</li>
        </OL>
      </Section>

      <Section id="laufzeit" title="§ 11 Term, termination and deleting your account">
        <OL>
          <li>The contract of use runs for an indefinite period.</li>
          <li>
            You can end it at any time without notice by deleting your account (under “My account” or in the service’s settings) or
            by notifying us of termination in text form. When your Tretu account is deleted, any remaining credits lapse; we point
            this out to you before deletion. Your right of withdrawal under § 8 and the refund under § 6(7) remain unaffected.
          </li>
          <li>
            We may terminate the contract with four weeks’ notice; § 6(7) applies. We may delete accounts that have not been used for
            more than two years and hold no purchased balance after announcing it by email with four weeks’ notice.
          </li>
          <li>
            Both parties’ right to terminate for good cause remains unaffected. Good cause exists for us in particular in the case of
            serious violations of these terms or violations repeated despite a warning. In the event of violations we may – taking
            into account your legitimate interests and the severity of the violation – also take milder measures, such as removing
            content, changing names, restricting features or temporarily blocking your account.
          </li>
          <li>
            After the contract ends, we delete your data in accordance with the <A href="/datenschutz">privacy policy</A>.
          </li>
        </OL>
      </Section>

      <Section id="dienste" title="§ 12 Special provisions for individual services">
        <Sub title="Saga">
          <P>
            Saga tells stories with AI. Input aimed at unlawful content or at sexual content involving minors is prohibited. We may
            filter input and output automatically. In campaigns with several players, the person who creates the campaign decides
            who may take part.
          </P>
        </Sub>
        <Sub title="Tretu Play">
          <P>
            Some content, in particular Punchline, contains crude humour meant for adults. Some Punchline cards are based on the
            base game of Cards Against Humanity and are licensed under CC BY-NC-SA 4.0; co-players and friends may use decks you
            share in the game. Roulette and other games with credits are pure entertainment without real money.
          </P>
        </Sub>
        <Sub title="Hollowmere">
          <P>
            Gold, casino chips, items, Wildlings and all other in-game values exist only in the game and are not Tretu Credits. They
            have no real-world value, cannot be bought with real money and cannot be paid out, sold or exchanged outside the game.
            The in-game casino simulates games of chance with play money and is not gambling. In co-op, the host decides who may join
            their world. AI helpers you connect with a token act on your behalf; you can revoke tokens at any time.
          </P>
        </Sub>
        <Sub title="Minecraft server">
          <P>
            The server rules in the game (“/hilfe”) and in the dashboard apply. Playtime limits, bonus tasks and rewards are
            voluntary offers without entitlement; ticked tasks rely on your honesty. Items, builds and progress on the server have no
            real-world value. Use of the Minecraft client is additionally subject to the terms of Mojang/Microsoft.
          </P>
        </Sub>
        <Sub title="Game server dashboard, TeamSpeak and Discord">
          <P>
            The game server dashboard is only available to team members with the respective role. The rules published on TeamSpeak
            and Discord apply there; Discord Inc.’s terms also apply to Discord.
          </P>
        </Sub>
      </Section>

      <Section id="aenderungen" title="§ 13 Changes to these terms">
        <OL>
          <li>
            We may change these terms with effect for the future if there is a valid reason, in particular new features, changes in
            the law or case law or to close gaps, and the change does not unreasonably disadvantage you.
          </li>
          <li>
            We inform you of changes at least six weeks before they take effect by email or in the service. You can object to the
            change until it takes effect or terminate the contract free of charge until then. If you do not object, the amended terms
            are deemed accepted; we point this out separately in the notification.
          </li>
          <li>
            We only make changes that significantly shift the balance of performance and consideration (e.g. the value of credits
            already purchased) with your express consent.
          </li>
        </OL>
      </Section>

      <Section id="schluss" title="§ 14 Dispute resolution and final provisions">
        <OL>
          <li>We are neither willing nor obliged to take part in dispute resolution proceedings before a consumer arbitration board.</li>
          <li>
            The law of the Federal Republic of Germany applies, excluding the UN Convention on Contracts for the International Sale
            of Goods. If you are a consumer habitually resident in another state, you retain the protection of the mandatory consumer
            protection provisions of that state.
          </li>
          <li>
            If you are a merchant, a legal entity under public law or a special fund under public law, the place of jurisdiction for
            all disputes is Hamburg.
          </li>
          <li>Should any provision of these terms be invalid, the validity of the remaining provisions remains unaffected.</li>
        </OL>
      </Section>
    </>
  );
}
