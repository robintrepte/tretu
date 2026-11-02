import { A, Box, P, Section, Sub, Table, UL } from "@/components/legal/legal-page";
import { OPERATOR, SERVICES } from "@/components/legal/operator";

export const DATENSCHUTZ_TOC_EN = [
  { id: "verantwortlicher", title: "Controller and scope" },
  { id: "ueberblick", title: "The key points" },
  { id: "begriffe", title: "Legal bases" },
  { id: "hosting", title: "Hosting, server log files and security" },
  { id: "cookies", title: "Cookies and local storage (§ 25 TDDDG)" },
  { id: "konto", title: "Tretu account (auth.tretu.de)" },
  { id: "hub", title: "tretu.de: website, sign-in and platform" },
  { id: "einbindungen", title: "Embedded third-party content" },
  { id: "saga", title: "Saga" },
  { id: "play", title: "Tretu Play" },
  { id: "hollowmere", title: "Hollowmere" },
  { id: "minecraft", title: "Minecraft server and dashboard" },
  { id: "teamspeak-discord", title: "TeamSpeak, Discord and social networks" },
  { id: "game-server", title: "Game server dashboard (team)" },
  { id: "email", title: "Email and contact" },
  { id: "zahlungen", title: "Payments and Tretu Credits" },
  { id: "statistik", title: "Statistics and status page" },
  { id: "empfaenger", title: "Recipients and processors" },
  { id: "drittland", title: "Transfers to third countries" },
  { id: "speicherdauer", title: "Retention" },
  { id: "rechte", title: "Your rights" },
  { id: "widerspruch", title: "Right to object" },
  { id: "sonstiges", title: "Obligation to provide data, automated decisions, minors" },
  { id: "aenderungen", title: "Changes to this privacy policy" },
];

export function DatenschutzEn() {
  return (
    <>
      <Section id="verantwortlicher" title="1. Controller and scope">
        <P>The controller within the meaning of the General Data Protection Regulation (GDPR) is:</P>
        <P>
          <strong className="text-foreground">{OPERATOR.company}</strong>
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.zip} {OPERATOR.city}, {OPERATOR.country.en}
          <br />
          Phone: {OPERATOR.phone}
          <br />
          Email: {OPERATOR.emailObfuscated}
          <br />
          Represented by the managing directors {OPERATOR.managingDirectors}. More details are in the{" "}
          <A href="/impressum">legal notice</A>.
        </P>
        <P>
          {OPERATOR.brand} is a brand of {OPERATOR.company}. This privacy policy applies to all services of the {OPERATOR.brand}{" "}
          brand:
        </P>
        <UL>
          <li>the community website and platform {SERVICES.hub} (including the internal game server dashboard),</li>
          <li>the central Tretu account at {SERVICES.auth},</li>
          <li>the AI role-playing game Saga at {SERVICES.saga},</li>
          <li>the browser game collection Tretu Play at {SERVICES.play},</li>
          <li>the game Hollowmere (website {SERVICES.hollowmere}, web version and desktop apps),</li>
          <li>the Tretu Minecraft server and its dashboard at {SERVICES.minecraft},</li>
          <li>the status page of our services ({SERVICES.status}),</li>
          <li>our community servers on TeamSpeak and Discord and our social media profiles.</li>
        </UL>
        <P>
          “We” and “us” in this policy mean {OPERATOR.company}. You can reach us about data protection using the contact details
          above.
        </P>
      </Section>

      <Section id="ueberblick" title="2. The key points">
        <UL>
          <li>We do not sell data, show no ads and do not track you across other websites.</li>
          <li>
            Our servers are hosted by Hetzner in Germany. We do not use analytics or tracking services; only Tretu Play counts page
            views with its own statistics, without cookies, which only store daily totals.
          </li>
          <li>
            We only use strictly necessary cookies and storage. Content from Twitch, Discord and TSViewer only loads when you click
            on it.
          </li>
          <li>
            One Tretu account signs you in to all services. Each service only receives the details it needs to work.
          </li>
          <li>
            Some features use external providers, such as AI services in Saga, Stripe for payments or Amazon SES for system emails.
            The relevant section explains which data goes where.
          </li>
        </UL>
      </Section>

      <Section id="begriffe" title="3. Legal bases">
        <P>We only process personal data if one of the following legal bases applies:</P>
        <UL>
          <li>
            <strong className="text-foreground">Contract (Art. 6(1)(b) GDPR)</strong> – to provide the services you use (e.g.
            account, games, platform features, credits) and to answer pre-contractual enquiries.
          </li>
          <li>
            <strong className="text-foreground">Legal obligation (Art. 6(1)(c) GDPR)</strong> – for example retention obligations
            under commercial and tax law or obligations to provide information to authorities.
          </li>
          <li>
            <strong className="text-foreground">Legitimate interests (Art. 6(1)(f) GDPR)</strong> – to run our services securely,
            reliably and free from abuse, to improve them and to communicate with the community. We name our interest in each
            section.
          </li>
          <li>
            <strong className="text-foreground">Consent (Art. 6(1)(a) GDPR, § 25(1) TDDDG)</strong> – when you expressly give us
            consent, for example for push notifications, game statistics in Hollowmere or loading embedded content. You can
            withdraw consent at any time with effect for the future (Art. 7(3) GDPR).
          </li>
        </UL>
        <P>
          We do not ask for special categories of personal data (Art. 9 GDPR). Please do not enter such information in free text,
          chats or AI prompts either.
        </P>
      </Section>

      <Section id="hosting" title="4. Hosting, server log files and security">
        <Sub title="Hosting">
          <P>
            All services run on servers we operate at Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany. The
            servers for websites, databases, the Tretu account and game backends are located in data centres in
            Germany. Hetzner processes the data as a processor on our behalf (Art. 28 GDPR). The legal basis is our legitimate
            interest in secure and economical operation (Art. 6(1)(f) GDPR) and the performance of the contract of use (Art.
            6(1)(b) GDPR).
          </P>
          <P>
            Individual game servers that the team starts via the game server dashboard run on their own virtual machines at
            Hetzner. Their location is chosen when they are created and is usually Germany; Hetzner also operates data centres in
            Finland, the USA and Singapore. When you connect to a game server, it processes your IP address and the data the game
            transmits (e.g. player name).
          </P>
        </Sub>
        <Sub title="Server log files">
          <P>
            Whenever our websites and APIs are accessed, the web server (nginx) automatically processes: IP address, date and
            time, requested address, HTTP status code, amount of data transferred, the previously visited page (referrer) and
            browser and operating system (user agent). We need this data to deliver the pages, find errors and fend off attacks
            (Art. 6(1)(f) GDPR). Log files are deleted after 7 days at the latest, unless we exceptionally need them longer to
            investigate a specific security incident.
          </P>
        </Sub>
        <Sub title="DNS and network: Cloudflare">
          <P>
            We manage the DNS records of our domains, including the addresses of game servers, at Cloudflare, Inc., 101 Townsend
            St., San Francisco, CA 94107, USA. For your device to find our servers, it queries Cloudflare’s name servers; Cloudflare
            processes the IP address of the requesting DNS resolver (usually your internet provider’s) and the name queried. Where
            individual addresses are routed through Cloudflare’s network, Cloudflare also processes the connection data (IP
            address, requested address, technical details of your browser) to deliver the connection and protect it against
            attacks. The legal basis is our legitimate interest in reliable and secure availability (Art. 6(1)(f) GDPR). For the
            transfer to the USA, see <A href="#drittland">section 19</A>.
          </P>
        </Sub>
        <Sub title="Security">
          <P>
            We transmit all data encrypted (TLS). We only store passwords as secure hashes and access tokens for third-party
            services in encrypted form. Only a few authorised people have access to servers and databases. To prevent abuse, we
            limit, for example, the number of sign-in attempts.
          </P>
        </Sub>
      </Section>

      <Section id="cookies" title="5. Cookies and local storage (§ 25 TDDDG)">
        <P>
          We only store information on your device or read it from your device where this is strictly necessary to provide the
          service you have expressly requested (§ 25(2) no. 2 TDDDG, German Telecommunications Digital Services Data Protection
          Act). No consent is required for this. We do not use advertising, tracking or analytics cookies. We base the subsequent
          processing of the data on Art. 6(1)(b) or (f) GDPR.
        </P>
        <Table
          head={["Storage entry", "Purpose", "Duration"]}
          rows={[
            [
              "Session cookie (e.g. tretu.session_token)",
              "Keeps you signed in after signing in (all services with an account).",
              "until you sign out, at most 30 days",
            ],
            [
              "Short-lived sign-in cookies",
              "Protect the sign-in via the Tretu account, Discord, Google or Apple against forgery (CSRF, PKCE).",
              "a few minutes",
            ],
            ["NEXT_LOCALE, NEXT_LOCALE_MANUAL", "Remember the chosen language.", "1 year"],
            ["theme (local storage)", "Remembers light/dark mode.", "until you delete it"],
            [
              "tretu-embeds (local storage)",
              "Remembers which embedded content (Twitch, Discord, TSViewer) should always load – only if you choose “always load”.",
              "until you delete it",
            ],
            [
              "Other settings (local storage)",
              "e.g. TRT avatars on tretu.de, sound and read-aloud settings in Play and Saga, local saves and settings in Hollowmere.",
              "until you delete them",
            ],
          ]}
        />
        <P>
          Third-party content that may set its own cookies (Twitch, the Discord widget, TSViewer) only loads after you click
          “load”. That click is your consent under § 25(1) TDDDG and Art. 6(1)(a) GDPR; you can withdraw it by deleting the
          “tretu-embeds” entry or the site data in your browser. You can view and delete cookies and local storage in your browser
          at any time; without the session cookie, however, you cannot stay signed in.
        </P>
      </Section>

      <Section id="konto" title="6. Tretu account (auth.tretu.de)">
        <P>
          The Tretu account is our central account for all services (“single sign-on”). It is managed at {SERVICES.auth}; you can
          reach the “My account” page at <A href="https://auth.tretu.de/konto">auth.tretu.de/konto</A>.
        </P>
        <Sub title="What data we process">
          <UL>
            <li>
              Account data: a permanent Tretu ID, username, display name, email address and its verification status, profile
              picture (optional), language and – if you sign in with a password – your password as a secure hash.
            </li>
            <li>
              Linked accounts, if you connect them: Discord ID, Minecraft UUID and name, Steam ID and sign-ins via external
              providers (see below).
            </li>
            <li>Roles, such as “admin” for team members.</li>
            <li>
              Sessions and security data: signed-in devices with IP address, browser identifier and time, verification and reset
              codes.
            </li>
          </UL>
        </Sub>
        <Sub title="Signing in to our services">
          <P>
            When you choose “Sign in with your Tretu account” in a Tretu service, the Tretu account transmits to that service (e.g.
            Saga or Play) via OpenID Connect your Tretu ID, username, display name, profile picture, email address with its
            verification status, language, roles and the IDs of linked accounts. The service uses them to match you with an
            existing account (via the Tretu ID, the ID of your old account with that service from the takeover of the previous
            accounts, the Discord ID or an email address verified on both sides) or creates a new one. We pass changes to
            your Tretu account (e.g. name, language or deletion) on to the services so that they stay up to date or also delete or
            anonymise your data.
          </P>
          <P>
            The legal basis is the performance of the contract of use (Art. 6(1)(b) GDPR); we process security data to prevent
            abuse (Art. 6(1)(f) GDPR).
          </P>
        </Sub>
        <Sub title="Signing in with Discord, Google or Apple">
          <P>
            Where we offer sign-in via Discord (Discord Inc., 444 De Haro Street, Suite 200, San Francisco, CA 94107, USA), Google
            (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland) or Apple (Apple Distribution International Ltd.,
            Hollyhill Industrial Estate, Hollyhill, Cork, Ireland) and you choose it, you are redirected to that provider. We receive
            an account identifier, your name and, where applicable, your email address and profile picture, and use this data only
            to sign you in and display your profile. We do not post anything on your behalf. The provider’s privacy terms apply to
            the processing by the provider; this may involve a transfer to the USA. Some services load profile pictures from these
            providers directly from their servers, which transmits the viewer’s IP address to the provider.
          </P>
        </Sub>
      </Section>

      <Section id="hub" title="7. tretu.de: website, sign-in and platform">
        <Sub title="Website">
          <P>
            When you visit {SERVICES.hub}, we process the log data described in section 4. Our server loads the video overview from
            the public YouTube feed of the Tretu channel and serves the thumbnails itself, so your browser does not connect to
            YouTube when showing the list. We run the Minecraft map (map.tretu.de) ourselves; it shows the world and the positions of
            players who are currently online.
          </P>
        </Sub>
        <Sub title="Signing in on tretu.de">
          <P>
            On tretu.de you sign in only with your Tretu account. For this we store a local user profile (display name, profile
            picture, Discord ID, Tretu ID, email address, language), your roles, the link to the Tretu account including the
            tokens it issues, and your sessions (with IP address and browser identifier). Links from the former direct sign-in
            with Discord are kept for now but no longer used; we delete them once we no longer need them for a possible return
            to the previous version. Each time you sign
            in, we update your name, profile picture and the time of your last sign-in. The legal basis is Art. 6(1)(b) GDPR.
          </P>
        </Sub>
        <Sub title="Platform: profiles, badges, friends, presence, notifications, credits">
          <P>The Tretu platform connects our services. For this we process, each linked to your Tretu ID:</P>
          <UL>
            <li>
              Profile: username, display name, profile picture, level and experience points, badges and statistics. Your profile is
              publicly visible at tretu.de/u/&lt;username&gt;.
            </li>
            <li>
              Game events reported by our services, such as finished matches with result, mode, duration and co-players, rounds
              played, worlds or characters created, achievements unlocked and minutes played. We use them to calculate statistics,
              levels and badges.
            </li>
            <li>Friendships, friend requests and game invitations.</li>
            <li>
              Presence: whether you are online or playing, in which service, what you are playing and a link to join. Friends see
              this; it expires two minutes after the service’s last sign of life.
            </li>
            <li>Notifications (title, text, link, read/unread) in the notification centre.</li>
            <li>
              Tretu Credits: balance and transactions (amount, type, reason, service, reference, time), including the welcome bonus
              and daily top-up.
            </li>
          </UL>
          <P>
            The legal basis is the performance of the contract of use (Art. 6(1)(b) GDPR). Game events without a Tretu ID are stored
            without reference to a person.
          </P>
        </Sub>
        <Sub title="Push notifications">
          <P>
            Only if you allow push notifications in your browser do we store the push address your browser creates for this,
            together with your account. Messages are delivered via your browser’s push service (e.g. Google, Mozilla or Apple); this
            may involve a transfer to the USA. The messages only contain a title, short text and link. The legal basis is your
            consent (Art. 6(1)(a) GDPR, § 25(1) TDDDG). You can turn notifications off at any time in the settings or in your browser;
            the push address is then deleted.
          </P>
        </Sub>
        <Sub title="TeamSpeak ranking">
          <P>
            For the ranking at tretu.de/ranking, a background service regularly queries our TeamSpeak server and stores per
            TeamSpeak identity: unique identifier, database ID and nickname, active online time (total, per week, month and year),
            idle time, rank and prestige, first and last connection and whether you are online. To detect idling, the client’s idle
            time and the channel name are evaluated (AFK channels do not count). The rank determines server groups that we set on
            the TeamSpeak server automatically. The leaderboard publicly shows nickname, rank, online time and online status. We also
            store the number of connected clients without reference to persons for the usage chart (30 days). The legal basis is our
            legitimate interest in giving active community members ranks and making activity visible (Art. 6(1)(f) GDPR). If you do
            not want to appear in the ranking, write to us – we will then exclude you from the ranking and the leaderboard.
          </P>
        </Sub>
      </Section>

      <Section id="einbindungen" title="8. Embedded third-party content">
        <P>
          On some pages of tretu.de you can load content from other providers. It is only embedded after you click “load”
          (two-click solution); before that, no data is transmitted to the provider. When it loads, your browser transmits your IP
          address, the page visited and technical details to the provider, and the provider may set cookies or store data in your
          browser. The legal basis is your consent (Art. 6(1)(a) GDPR, § 25(1) TDDDG).
        </P>
        <UL>
          <li>
            Twitch (livestream): Twitch Interactive, Inc., 350 Bush Street, 2nd Floor, San Francisco, CA 94104, USA –{" "}
            <A href="https://www.twitch.tv/p/legal/privacy-notice/">privacy notice</A>.
          </li>
          <li>
            Discord widget: Discord Inc., 444 De Haro Street, Suite 200, San Francisco, CA 94107, USA –{" "}
            <A href="https://discord.com/privacy">privacy policy</A>.
          </li>
          <li>
            TSViewer (display of the TeamSpeak channels): loaded from tsviewer.com – <A href="https://www.tsviewer.com">tsviewer.com</A>.
          </li>
          <li>
            YouTube videos: if you click a video in the video overview, it is played in privacy-enhanced mode
            (youtube-nocookie.com) by Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland –{" "}
            <A href="https://policies.google.com/privacy">privacy policy</A>.
          </li>
        </UL>
      </Section>

      <Section id="saga" title="9. Saga">
        <P>Saga ({SERVICES.saga}) is a role-playing game narrated by an AI game master.</P>
        <Sub title="Account and content">
          <UL>
            <li>
              Account data: username, email address, password (only as a secure hash), optional display name; when signing in via
              the Tretu account, Google or Discord, the details transmitted by them (see section 6).
            </li>
            <li>
              Content you create or that is created in the game: characters, worlds, campaigns, game messages, dice rolls, generated
              images, music and voice output.
            </li>
            <li>Credit balance, purchases and usage (see section 16).</li>
          </UL>
          <P>
            Public heroes and worlds are visible to others on your profile; you can change the visibility in the settings and for
            each item. Co-players in a campaign see the group’s heroes and the course of the game. The legal basis is Art. 6(1)(b)
            GDPR.
          </P>
        </Sub>
        <Sub title="AI services">
          <P>
            For narration, generated content, images, music, voice output and – if you use it – voice input, we transmit the game
            content required for this (e.g. your actions, character and world descriptions, and for voice input the recording of
            your voice) to specialised providers:
          </P>
          <UL>
            <li>OpenAI (text, images, voice output, speech recognition): OpenAI, L.L.C. or OpenAI Ireland Ltd.;</li>
            <li>Replicate (images, voice output, music): Replicate, Inc., USA;</li>
            <li>ElevenLabs (voice output): ElevenLabs, Inc., USA.</li>
          </UL>
          <P>
            These providers process the data on our behalf and are partly based or have servers outside the EU, in particular in
            the USA (see section 19). We do not transmit account data such as email address or password. Please do not enter
            sensitive personal information in game messages. The legal basis is Art. 6(1)(b) GDPR, as the game does not work
            without this processing.
          </P>
        </Sub>
        <Sub title="Playing via Discord">
          <P>
            If a campaign is connected to a Discord channel, our Saga bot processes the messages players address to the campaign in
            that channel and their Discord names, in order to pass them to the AI game master and post the replies in the channel.
          </P>
        </Sub>
      </Section>

      <Section id="play" title="10. Tretu Play">
        <P>
          Tretu Play ({SERVICES.play}) is a collection of browser games. The database, sign-in and the real-time connection for
          multiplayer matches run on our server in Germany; fonts are served by our server.
        </P>
        <UL>
          <li>
            Account data: display name, username, email address, password (only as a secure hash) or passkey (only your device’s
            public key), where applicable a profile picture and the link to your Tretu account, Google or Discord.
          </li>
          <li>
            Guest accounts: if you play as a guest, we create an account with a random name without you having to enter an email
            address. If you create a proper account later, we transfer your progress.
          </li>
          <li>
            Game data: matches with participants, rankings and points, solitaire rounds, achievements, friendships, your own
            Punchline decks as well as credits and their transactions.
          </li>
          <li>Session data: a session with IP address and browser identifier for every sign-in.</li>
        </UL>
        <P>
          Your display name, username, profile picture, statistics and achievements are visible on your public profile and in the
          leaderboards. Co-players in a match see your name, profile picture and reactions; friends see whether you are online and
          can use your shared decks. For turn notifications, the “Push notifications” part of section 7 applies accordingly.
        </P>
        <P>
          If you play Globetrotter, your browser loads the street images directly from the servers of the open project Panoramax
          (operated by OpenStreetMap France and other instances, among others) and the map tiles from the OpenStreetMap Foundation,
          St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, United Kingdom. This transmits your IP address and technical
          details of your browser to these servers. The game cannot be displayed without these requests (Art. 6(1)(b) and (f)
          GDPR).
        </P>
        <P>
          To operate the service and handle abuse, authorised team members can view the data stored for your account and, for
          example, correct credits or block accounts in case of violations; every such change is logged. The legal bases are Art.
          6(1)(b) and (f) GDPR. Sessions expire after 30 days at the latest; we delete guest accounts automatically once their last
          session expired more than 30 days ago. You can delete your account yourself in the settings; in other players’ past
          matches, only the display name used at the time remains, without a link to your account.
        </P>
        <Sub title="Tretu Play visitor statistics">
          <P>
            Tretu Play counts page views with its own statistics on our server, without cookies and without external services.
            Pages you open in your browser are counted; requests by recognisable bots and programs are not. Only details your
            browser sends with every page request anyway are evaluated: the page requested (addresses of individual rooms and
            profiles are combined into one entry each), the domain of the website you came from or a campaign tag in the address
            (“utm_source”), the device type (smartphone, tablet or computer, derived from the browser identifier) and the language
            (from the address, the language cookie or your browser’s language setting).
          </P>
          <P>
            So that visitors are counted only once per day, the server calculates a shortened checksum (hash) from your IP
            address, your browser identifier and a random value that is newly generated every day. The random value and the
            checksums are only held in memory, are never stored and are discarded with the first page request after midnight
            (German time) or when the server restarts; they cannot be traced across days or back to you. In the database we only
            store daily totals – views and visitors per page, origin, device type and language – without reference to individual
            persons. Only Tretu Play’s administrators see these totals; we keep them without a fixed time limit.
          </P>
          <P>
            The legal basis is our legitimate interest in understanding how Tretu Play is used and improving it (Art. 6(1)(f)
            GDPR). You can object to this at any time (<A href="#widerspruch">section 22</A>).
          </P>
        </Sub>
      </Section>

      <Section id="hollowmere" title="11. Hollowmere">
        <P>
          Hollowmere is a game for browsers and desktops. We run the website ({SERVICES.hollowmere}) and the game server on our
          server in Germany; as the game server we use the open-source software Nakama, which we operate ourselves. Offline, your
          save stays on your device.
        </P>
        <UL>
          <li>
            Account: email address and password (only as a hash), sign-in via the Tretu account, Google, Apple or Discord (we store
            the provider’s account identifier and an email address only if the provider sends one; for Discord, our server checks
            the sign-in token with Discord once and does not keep it) or guest access with a random identifier on your device; plus a
            display name and a session token on the device.
          </li>
          <li>
            Cloud saves: as long as you are signed in and do not turn cloud backup off, every save (farm name, farmer name, day,
            money, creatures, items, buildings, progress) is additionally stored on our server, only for your account.
          </li>
          <li>Account settings: volumes, language, key bindings, tutorials seen.</li>
          <li>Co-op: the other players in a session see your display name, the shared farm and your chat messages in that session.</li>
          <li>
            AI agents: if you create a token for an AI helper, we store a hash of the token, its permissions and expiry date. We
            only hold the helper’s commands until your open game answers. It is not us but your own program that sends the save to
            the helper’s vendor.
          </li>
          <li>
            Error reports (in release builds, while you are signed in): error text, location in the code, game version and
            platform – without email address or save. You can turn them off in the settings.
          </li>
          <li>Game statistics (only with your consent): minutes played, game version, platform and in-game day.</li>
        </UL>
        <P>
          Legal bases: account, cloud saves, settings and co-op Art. 6(1)(b) GDPR; error reports our legitimate interest in finding
          and fixing crashes (Art. 6(1)(f) GDPR); game statistics your consent (Art. 6(1)(a) GDPR). If you download Hollowmere via a
          distribution platform, that platform processes the resulting data under its own responsibility. Cloud saves are kept
          until you delete the farm in the game or we delete the account.
        </P>
      </Section>

      <Section id="minecraft" title="12. Minecraft server and dashboard">
        <Sub title="Game server">
          <P>
            When you play on our Minecraft server, we process your Minecraft UUID, player name, IP address, connection times, chat
            messages and commands, game statistics and advancements, inventories and world data, as well as a log of your actions in
            the world (e.g. blocks broken and placed with location and time), which we need to investigate griefing. In addition,
            playtime and playtime limits and voluntary base markers on the 3D map. The map shows the world and the positions of
            players who are currently online.
          </P>
          <P>
            The AI companion “Astra” replies when you address her in chat. For this we transmit your message to her, your player
            name and the necessary details of the game situation to an AI provider (depending on the configuration OpenAI,
            Anthropic PBC, USA, or Amazon Bedrock by Amazon Web Services); Astra remembers a few facts per player, which you can
            delete with “/astra vergiss”.
          </P>
        </Sub>
        <Sub title="Dashboard (mc.tretu.de)">
          <P>
            You sign in to the dashboard with a code you get in the game with “/dashboard”, or with your Tretu account; a session
            cookie is set. The dashboard shows players, achievements, leaderboards, chronicle, weekly review, community projects and
            shops. For bonus playtime you can voluntarily tick off everyday tasks (such as sports, steps, reading, meditation); we
            store which task you ticked on which day and calculate bonus minutes and streaks from it. Please only tick what you want
            others to see – streaks and rewards are visible in the game.
          </P>
          <P>
            If you have linked your Minecraft account to your Tretu account, we report your minutes played to the Tretu platform
            (section 7). The legal bases are Art. 6(1)(b) GDPR (game operation, dashboard, platform) and Art. 6(1)(f) GDPR
            (protection against griefing and abuse, server security).
          </P>
        </Sub>
      </Section>

      <Section id="teamspeak-discord" title="13. TeamSpeak, Discord and social networks">
        <Sub title="TeamSpeak server">
          <P>
            We run our TeamSpeak server ourselves. When you connect, it processes your IP address, your unique TeamSpeak identity,
            nickname, channel, connection times and server groups; voice is transmitted but not recorded. Section 7 applies to the
            ranking. The legal basis is Art. 6(1)(b) and (f) GDPR.
          </P>
        </Sub>
        <Sub title="Discord server and bots">
          <P>
            Our community server on Discord runs on the platform of Discord Inc., which processes data of its own under its own
            responsibility. As the server operator we see your Discord name, your messages and roles on our server. Our bots (e.g.
            the Saga bot) only process messages in the channels and for the functions they are set up for.
          </P>
        </Sub>
        <Sub title="Social media profiles">
          <P>
            We maintain profiles on Twitch, YouTube and Facebook. If you interact with us there, the operators process your data
            under their own terms. For statistics on our Facebook page (“Insights”) we are jointly responsible with Meta Platforms
            Ireland Limited, Merrion Road, Dublin 4, Ireland (Art. 26 GDPR); under the agreement, Meta assumes primary responsibility
            and handles data subject requests. We only receive aggregated statistics. The legal basis is our legitimate interest in
            communicating with the community (Art. 6(1)(f) GDPR).
          </P>
        </Sub>
      </Section>

      <Section id="game-server" title="14. Game server dashboard (team)">
        <P>
          Only team members with a corresponding role use the internal dashboard at tretu.de/dashboard. For this we store roles and
          a log of the actions triggered (who started, backed up or changed which server and when; console commands with their
          content). For managing servers we use the APIs of Hetzner (virtual machines, storage, firewalls) and Cloudflare (DNS) as
          well as Modrinth, CurseForge and Mojang for downloads; we do not transmit any personal data of players to them. The legal
          basis is our legitimate interest in traceable and secure administration (Art. 6(1)(f) GDPR).
        </P>
      </Section>

      <Section id="email" title="15. Email and contact">
        <P>
          We send system emails – for example to confirm your email address, change the address or reset your password – via
          Amazon Simple Email Service (Amazon Web Services EMEA SARL, 38 Avenue John F. Kennedy, L-1855 Luxembourg) in the Frankfurt
          region (eu-central-1). This processes your email address, your name and the content of the email. We do not send
          advertising or newsletters. The legal basis is Art. 6(1)(b) GDPR.
        </P>
        <P>
          If you contact us by email, phone or via Discord, we process your details to answer your enquiry (Art. 6(1)(b) or (f)
          GDPR) and delete them when they are no longer needed and no retention obligations apply.
        </P>
      </Section>

      <Section id="zahlungen" title="16. Payments and Tretu Credits">
        <P>
          You pay for credit packages you buy in a service (e.g. Saga) via Stripe (Stripe Payments Europe, Limited, 1 Grand Canal
          Street Lower, Grand Canal Dock, Dublin, D02 H210, Ireland). You enter the payment details (e.g. card or account details)
          directly at Stripe; we do not receive them. From Stripe we only receive whether and when the payment was made, amount,
          currency, a payment reference and the email address the receipt is sent to. Stripe processes the data for payment
          processing on our behalf and for fraud prevention and to meet its own legal obligations under its own responsibility (
          <A href="https://stripe.com/privacy">Stripe privacy policy</A>); this may involve a transfer to the USA.
        </P>
        <P>
          We credit the purchase to your credits account on the Tretu platform (section 7). The legal bases are Art. 6(1)(b) GDPR
          (contract) and Art. 6(1)(c) GDPR (retention of accounting records under § 147 AO and § 257 HGB, German tax and commercial
          codes).
        </P>
      </Section>

      <Section id="statistik" title="17. Statistics and status page">
        <Sub title="No analytics or tracking services">
          <P>
            On {SERVICES.hub}, {SERVICES.auth}, in Saga, Hollowmere and the Minecraft dashboard we do not use any analytics or
            tracking tools (such as analytics scripts or tracking pixels), neither our own nor third-party ones. Tretu Play counts
            page views with its own statistics without cookies, which only store daily totals (<A href="#play">section 10</A>).
            Game statistics in Hollowmere are only collected with your consent (<A href="#hollowmere">section 11</A>).
          </P>
        </Sub>
        <Sub title="Status page">
          <P>
            At {SERVICES.status} we show whether our services are reachable. For this, our own server requests the technical status
            addresses of our services once a minute and stores whether and how fast they answered (individual checks 7 days,
            hourly and daily values 90 days). For the Minecraft and TeamSpeak servers we also request how many players or
            users are connected and show that number. For technical reasons the servers also return names or identifiers of
            connected people; we do not evaluate or store them, only the number is stored. The legal basis is our legitimate
            interest in informing about the availability of our services (Art. 6(1)(f) GDPR). When you visit the status page,
            the information on server log files in <A href="#hosting">section 4</A> applies.
          </P>
        </Sub>
      </Section>

      <Section id="empfaenger" title="18. Recipients and processors">
        <P>
          We only pass on personal data where this is necessary for the purposes described, you have consented or we are legally
          obliged to do so. Recipients are:
        </P>
        <Table
          head={["Recipient", "Purpose", "Role"]}
          rows={[
            ["Hetzner Online GmbH, Germany", "servers, storage, game server VMs", "processor"],
            ["Cloudflare, Inc., USA", "DNS, network services", "processor"],
            ["Amazon Web Services EMEA SARL, Luxembourg", "system emails (SES); AI (Bedrock) for Astra where configured", "processor"],
            ["Stripe Payments Europe, Ltd., Ireland", "payment processing", "processor or own responsibility (fraud prevention)"],
            ["OpenAI, Replicate, Inc., ElevenLabs, Inc.", "AI features in Saga", "processor"],
            ["OpenAI, Anthropic PBC, Amazon Bedrock", "AI companion Astra (Minecraft)", "processor"],
            ["Discord, Google, Apple", "sign-in, if you choose it", "own responsibility"],
            ["Push services of browser vendors", "delivery of push notifications", "own responsibility"],
            ["Twitch, Discord, TSViewer, YouTube", "embedded content after your click", "own responsibility"],
            ["Panoramax instances, OpenStreetMap Foundation", "images and maps in Globetrotter (Play)", "own responsibility"],
            ["Meta Platforms Ireland Ltd.", "Facebook page statistics", "joint responsibility"],
            ["Authorities, courts, advisers", "where legally required or to pursue legal claims", "own responsibility"],
          ]}
        />
        <P>
          Contracts under Art. 28 GDPR are in place or apply with our processors. The Tretu services themselves are not separate
          companies: data only flows between them as described in this policy.
        </P>
      </Section>

      <Section id="drittland" title="19. Transfers to third countries">
        <P>
          Some of the providers named are based in the USA or process data there (Cloudflare, Stripe, OpenAI, Replicate,
          ElevenLabs, Anthropic, Amazon, Discord, Google, Apple, Twitch and push services). On 10 July 2023 the European Commission
          adopted an adequacy decision for the USA (EU-US Data Privacy Framework); we base transfers to providers certified under
          it on Art. 45 GDPR. For providers without certification, we agree the European Commission’s standard contractual clauses
          (Art. 46(2)(c) GDPR) and assess supplementary measures. An adequacy decision exists for the United Kingdom (OpenStreetMap
          Foundation) (Art. 45 GDPR). If you load embedded content or sign in via a provider, the transfer takes place at your
          request (Art. 49(1)(a) or (b) GDPR). On request, we will provide you with a copy of the respective safeguards.
        </P>
      </Section>

      <Section id="speicherdauer" title="20. Retention">
        <P>
          We only keep personal data for as long as necessary for the respective purpose and delete it afterwards, unless legal
          retention obligations apply. In detail:
        </P>
        <Table
          head={["Data", "Retention"]}
          rows={[
            ["Server log files", "at most 7 days"],
            ["Sessions", "until you sign out, at most 30 days (Play: 30 days)"],
            ["Accounts, profiles, saves, content", "until the account or the content is deleted"],
            ["Presence (online/playing)", "2 minutes after the last sign of life"],
            ["Guest accounts (Play)", "automatically 30 days after the last session expired"],
            ["TeamSpeak usage / game server status data", "30 days or 2 days, without reference to persons"],
            [
              "Tretu Play visitor statistics",
              "checksums only in memory until the day ends; daily totals without reference to persons without a fixed limit",
            ],
            [
              "Results of the status checks",
              "7 days (individual checks), 90 days (hourly and daily values); for game and TeamSpeak servers only the number connected",
            ],
            ["Credit transactions, payment records", "10 years (§ 147 AO, § 257 HGB), then deleted"],
            ["Contact enquiries", "until resolved, then as long as obligations require"],
            ["Game server dashboard logs", "as long as the respective server exists"],
          ]}
        />
        <P>
          If you delete your Tretu account, we inform all services, which then also delete your data or anonymise it so that it no
          longer relates to you (e.g. in leaderboards or other players’ past matches only an anonymous entry remains). We restrict
          data we are obliged to keep until the retention period ends.
        </P>
      </Section>

      <Section id="rechte" title="21. Your rights">
        <P>You have the following rights regarding your personal data:</P>
        <UL>
          <li>right of access (Art. 15 GDPR),</li>
          <li>right to rectification (Art. 16 GDPR),</li>
          <li>right to erasure (Art. 17 GDPR),</li>
          <li>right to restriction of processing (Art. 18 GDPR),</li>
          <li>right to data portability (Art. 20 GDPR),</li>
          <li>right to object to processing (Art. 21 GDPR, see below),</li>
          <li>right to withdraw consent at any time with effect for the future (Art. 7(3) GDPR).</li>
        </UL>
        <P>
          You can view, change or delete many details yourself under “My account” and in the services’ settings. For everything
          else, write to us at {OPERATOR.emailObfuscated}.
        </P>
        <P>
          You also have the right to lodge a complaint with a data protection supervisory authority (Art. 77 GDPR), in particular in
          the member state of your habitual residence, place of work or the alleged infringement. The authority responsible for us
          is: Der Hamburgische Beauftragte für Datenschutz und Informationsfreiheit, Ludwig-Erhard-Str. 22, 20459 Hamburg, Germany,{" "}
          <A href="https://datenschutz-hamburg.de">datenschutz-hamburg.de</A>.
        </P>
      </Section>

      <Section id="widerspruch" title="22. Right to object">
        <Box>
          <P>
            <strong>Right to object under Art. 21 GDPR</strong>
          </P>
          <P>
            Where we process your data on the basis of legitimate interests (Art. 6(1)(f) GDPR), you have the right to object at any
            time on grounds relating to your particular situation. We will then no longer process the data unless we can
            demonstrate compelling legitimate grounds for the processing which override your interests, rights and freedoms, or the
            processing serves the establishment, exercise or defence of legal claims.
          </P>
          <P>
            We do not process data for direct marketing. You can object informally, most easily by email to{" "}
            {OPERATOR.emailObfuscated}.
          </P>
        </Box>
      </Section>

      <Section id="sonstiges" title="23. Obligation to provide data, automated decisions, minors">
        <P>
          You are under no legal or contractual obligation to provide data. Without the details marked as required (e.g. the email
          address for an account), however, we cannot provide the respective feature.
        </P>
        <P>
          There is no solely automated decision within the meaning of Art. 22 GDPR that produces legal effects concerning you or
          similarly significantly affects you. Generating game content with AI, calculating ranks, levels and badges and automatic
          game rewards are not such decisions.
        </P>
        <P>
          Our services are aimed at people aged 16 and over. If you are younger, you need the permission of your parents or legal
          guardians for an account and for consent (Art. 8 GDPR). Hollowmere and the Minecraft server are not aimed at children
          under 16; if you believe we process a child’s data without such permission, write to us and we will delete it.
        </P>
      </Section>

      <Section id="aenderungen" title="24. Changes to this privacy policy">
        <P>
          We update this privacy policy when our services or the legal situation change. The version published here applies; its
          date is shown at the top. We additionally inform you about material changes that affect your account in the respective
          service or by email.
        </P>
      </Section>
    </>
  );
}
