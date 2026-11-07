# HGU: Ufora in je eigen browser

HGU (HydrarGyrum Ufora) is een browserextensie die [Ufora](https://ufora.ugent.be) (UGent, Brightspace) toont als een snellere, rustigere pagina: je vakken, de vakinhoud, opdrachten en deadlines, aankondigingen, het restomenu en je bestanden. Je kan ook de bestanden van je vakken synchroniseren naar een map op je computer.

> **v0.1 beta: controleer deadlines altijd ook in Ufora. Niet officieel van UGent.**
> Dit is een persoonlijk project van een student. Het is niet verbonden aan, gesponsord of goedgekeurd door de UGent. Gebruik het volgens de gebruiksvoorwaarden van de UGent, op eigen risico en zonder garantie.

**Je logt zelf in op de echte Ufora, in je eigen browser.** De extensie gebruikt die sessie om de Brightspace-API van Ufora rechtstreeks vanuit je browser aan te spreken. Er is geen server van ons: geen login, geen gegevens en geen analytics gaan naar de maker of naar iemand anders.

## Installeren

Download de zip voor jouw browser (zie de releases of [hydrargyrum.be/hgu](https://hydrargyrum.be/hgu/)) en controleer eventueel de SHA-256 met `sha256sum -c SHA256SUMS`.

### Chrome, Edge, Brave

1. Pak de zip uit in een map die je bijhoudt (die moet blijven staan).
2. Open `chrome://extensions` (Edge: `edge://extensions`) en zet **Ontwikkelaarsmodus** aan.
3. Kies **Uitgepakte extensie laden** en selecteer de uitgepakte map (die met `manifest.json`).
4. Klik op het HGU-icoon (eventueel vastpinnen via het puzzelstukje): HGU opent in een tabblad.
5. Staat er dat je Ufora-sessie verlopen is? Klik **Inloggen bij Ufora**, log zelf in (UGent + MFA) en HGU gaat vanzelf verder.

Chrome kan bij het opstarten vragen of je de uitgepakte extensie wil houden; dat is normaal voor ontwikkelaarsextensies.

### Firefox

Pak de Firefox-zip uit, open `about:debugging#/runtime/this-firefox`, kies **Tijdelijke add-on laden** en selecteer `manifest.json` in de uitgepakte map. Een tijdelijke add-on verdwijnt als je Firefox sluit; permanent installeren kan pas met een ondertekende add-on (niet beschikbaar). Geeft Firefox de sitetoegang niet automatisch, dan toont HGU een knop **Toegang geven**.

## Gebruik

- **Overzicht, vakken, opdrachten, aankondigingen, dagmenu:** eerst de cache, daarna ververst het op de achtergrond van de pagina.
- **Bestanden:** pdf's, afbeeldingen en tekst openen in de pagina of in een nieuw tabblad; de rest downloadt. html, svg en xml worden nooit getoond maar enkel gedownload.
- **Synchroniseren** (voetregel onderaan, of de pagina `sync.html`): kies een map (Chrome/Edge), vink je vakken aan en klik **Nu synchroniseren**. Dat gebeurt enkel als jij klikt, nooit automatisch. Nieuw bestand = downloaden; gewijzigd op Ufora en lokaal niet aangeraakt = overschrijven; gewijzigd én lokaal bewerkt = nieuwe versie ernaast als `naam (Ufora DD-MM).ext`; wat er al stond voor de eerste sync blijft staan. In Firefox (geen mapkeuze) krijg je één zip met de nieuwe bestanden. **Gedownloade bestanden zijn enkel voor eigen studie: niet verspreiden.**
- **Instellingen:** voornaam, korte naam per vak, en alles wissen.
- **Indienen:** niet mogelijk. Dien opdrachten in op Ufora zelf (HGU toont een link).

## Wat wordt lokaal opgeslagen, en hoe wis je het

In de browser (IndexedDB van de extensie) staan: een cache van je vakken, inhoud, opdrachten en aankondigingen (zodat de pagina meteen iets toont), het restomenu, je instellingen (voornaam, korte vaknamen), de synchronisatiestatus en de gekozen map. Je Ufora-wachtwoord of -cookies worden niet door HGU bewaard; de sessie is die van je browser zelf.

**Wissen:** open de synchronisatie- en instellingenpagina en klik **Alle lokale gegevens wissen**. De extensie verwijderen wist ook alles. Bestanden die je zelf naar een map gesynchroniseerd hebt, staan in die map en verwijder je zelf.

## Privacy en rechten

- Rechten: enkel `https://ufora.ugent.be/*` (je vakken, met je eigen sessie) en `https://hydra.ugent.be/*` (restomenu). Geen `tabs`, `cookies`, `storage`, `downloads` of `webRequest`, geen content scripts, geen externe scripts of lettertypes.
- De CSP van de extensiepagina's laat verzoeken enkel naar die twee hosts toe.
- Er is geen telemetrie, geen account en geen server van de maker.
- Afbeeldingen in aankondigingen van andere websites dan Ufora worden geblokkeerd (anders zou je IP-adres bij derden terechtkomen).

## Bekende beperkingen

- **Beta:** getest met een nagebootste Ufora met dezelfde JSON-vorm als Brightspace en met de echte Ufora in uitgelogde toestand (de redirect naar de login wordt herkend). Test met echte, ingelogde sessies van meerdere studenten ontbreekt nog; meld problemen via een issue.
- Ufora kan zijn API wijzigen. Geeft Ufora een antwoord dat HGU niet begrijpt, dan toont HGU een foutmelding in plaats van een lege lijst. Een lege lijst is dus geen bewijs dat er niets is: kijk bij twijfel op Ufora zelf.
- HGU doet hoogstens 3 verzoeken tegelijk naar Ufora en probeert bij een storing of "te veel verzoeken" (429/5xx) opnieuw met stijgende wachttijd.
- Inloggen gebeurt niet automatisch op de achtergrond; verloopt je sessie, dan log je opnieuw in op Ufora.
- Sync enkel op verzoek. Chrome vraagt na een herstart soms opnieuw toestemming voor de map (een klik op **Nu synchroniseren** volstaat).
- Firefox: geen mapkeuze (zip), tijdelijke installatie, enkel een rooktest.
- Geen iPhone/iPad (Safari-extensies vragen Xcode of de App Store).

## Ontwikkelen

```bash
python tools/build.py          # dist/chrome, dist/firefox, de zips en dist/SHA256SUMS
python tests/e2e.py            # echte Chromium met de uitgepakte extensie tegen een nagebootste Ufora
npx web-ext lint -s dist/firefox
```

`src/` is precies wat je als uitgepakte extensie laadt. `src/api.js` is de datalaag (Brightspace-API van Ufora en de Hydra-API van het restomenu), `src/sync.js` de synchronisatie; `src/app/` is de weergave. `tools/sync-shared.py` kopieert die weergave uit de HGU-bron van de maker en is voor gebruikers niet nodig. De tests starten Playwrights Chromium (`playwright install chromium`), want branded Chrome 137+ laadt geen extensies via de opdrachtregel meer.

## Licentie

[MIT](LICENSE)
