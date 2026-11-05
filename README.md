# HGU-extensie

HGU (HydrarGyrum Ufora) als browserextensie: een snellere, rustige weergave van [Ufora](https://ufora.ugent.be) (UGent, Brightspace) met je vakken, vakinhoud, deadlines, aankondigingen, het restomenu en downloads, plus synchronisatie naar een map op je computer.

**Je logt zelf in op de echte Ufora, in je eigen browser.** De extensie gebruikt die sessie om de Brightspace-API aan te spreken, rechtstreeks vanuit je browser. Er is geen server van ons: geen login, geen data en geen analytics gaan naar iemand anders.

> Status: eerste versie (0.1.0). Getest met een nagebootste Ufora (Chrome) en een rooktest in Firefox. Nog niet getest met een echte, ingelogde Ufora-sessie, zie [Wat niet (zeker) werkt](#wat-niet-zeker-werkt).

## Installeren

### Chrome, Edge, Brave (uitgepakt)

1. Haal deze map binnen (`git clone` of zip).
2. Open `chrome://extensions` (Edge: `edge://extensions`) en zet **Ontwikkelaarsmodus** aan.
3. **Uitgepakte extensie laden** en kies de map `src/`.
4. Klik op het HGU-icoon (eventueel vastpinnen via het puzzelstukje): HGU opent in een tabblad.
5. Staat er "Je Ufora-sessie is verlopen"? Klik **Inloggen bij Ufora**: Ufora opent in een tabblad, je logt zelf in (UGent + MFA) en HGU gaat vanzelf verder.

Chrome kan bij elke start vragen of je de uitgepakte extensie wil blijven gebruiken; dat is normaal voor ontwikkelaarsextensies. Voor een permanente installatie is de Chrome Web Store nodig (niet gedaan).

### Firefox

```bash
python tools/build.py          # maakt dist/firefox en dist/hgu-firefox-0.1.0.zip
```

Open `about:debugging#/runtime/this-firefox`, **Tijdelijke add-on laden** en kies `dist/firefox/manifest.json`. Een tijdelijke add-on verdwijnt als je Firefox sluit. Permanent installeren kan pas met een ondertekende add-on (addons.mozilla.org, ook als "niet-vermeld"); dat is niet gedaan.

Heeft Firefox de sitetoegang niet automatisch gegeven, dan toont HGU een knop **Toegang geven**.

## Gebruik

- **Overzicht, vakken, opdrachten, aankondigingen, dagmenu:** zoals in HGU. Eerst de cache, dan ververst het op de achtergrond.
- **Bestanden:** pdf's, afbeeldingen en tekst openen in de pagina of in een nieuw tabblad; de rest downloadt. Bijlagen van opdrachten, feedback en aankondigingen werken ook. html, svg en xml worden nooit getoond maar enkel gedownload.
- **Synchroniseren** (voetregel onderaan, of `sync.html`): kies een map (Chrome/Edge), vink je vakken aan en klik **Nu synchroniseren**. Regels zoals in HGU: nieuw bestand = downloaden; gewijzigd op Ufora en lokaal niet aangeraakt = overschrijven; gewijzigd én lokaal bewerkt = nieuwe versie ernaast als `naam (Ufora DD-MM).ext`; wat er al stond voor de eerste sync blijft staan. In Firefox (geen mapkeuze) krijg je één zip met de nieuwe bestanden.
- **Instellingen** (zelfde pagina): voornaam, korte naam per vak, en alles wissen.
- **Indienen:** staat uit. Opdrachten indien je op Ufora zelf (er staat een link).

## Extensie of HGU?

| | Extensie | HGU lokaal (Windows) | HGU op de server |
|---|---|---|---|
| Wie logt in en waar | jij, op Ufora, in je eigen browser | jij, in een Chrome-venster dat HGU opent | jij, via VNC op de server |
| Waar staat je sessie | in je browser | in `browser-profile/` op je pc | op de server |
| Meerdere studenten | ja, elk in de eigen browser | nee | nee (enkel Henri) |
| Installatie | extensie laden | Python, venv, Chrome | server, nginx, accounts |
| Vernieuwt de sessie zelf op de achtergrond | nee, jij logt in als ze verloopt | ja (stille SSO via Chrome-profiel) | ja |
| Dagelijkse sync zonder open pagina | nee, enkel als je op **Nu synchroniseren** klikt | ja (Taakplanner) | n.v.t. |
| API op `localhost:8642` (Claude's ufora-skill, scripts) | nee | ja | via de login |
| Vakmap-sync voor Claude (OneDrive-mappen) | handmatig via de sync-pagina | ja | nee |
| iPhone / iPad | nee | via de server | ja |
| Indienen | uit | aan | uit (standaard) |
| Gegevens naar derden | geen | geen | geen |

Kort: de extensie is er voor wie gewoon een betere Ufora-weergave in de eigen browser wil, zonder iets te installeren buiten de browser. Henri houdt zijn lokale HGU voor alles wat een localhost-API of een geplande sync nodig heeft, en de server-HGU voor de telefoon.

## Wat niet (zeker) werkt

- **Niet getest met een echte, ingelogde Ufora.** De tests draaien tegen een nagebootste Ufora met dezelfde JSON-vorm als Brightspace. Of cookies in extensieverzoeken altijd meegaan (SameSite-beleid van Ufora/de browser) is dus nog niet bevestigd. Wel bevestigd met de echte Ufora (niet ingelogd, Firefox 159): de redirect naar de loginpagina wordt herkend en HGU toont "Je Ufora-sessie is verlopen". Werkt het ingelogd niet, meld dan eerst wat de pagina zegt.
- **Geen `localhost:8642`-API.** Claude's ufora-skill en de vakmap-sync voor Henri blijven de gewone HGU nodig hebben.
- **Geen iPhone.** Safari-extensies vragen Xcode of de App Store. (Firefox voor Android kan met een eigen add-on-collectie; niet onderzocht.)
- **Inloggen gaat niet automatisch op de achtergrond.** Verloopt je sessie, dan log je opnieuw in op Ufora (HGU opent het tabblad voor je).
- **Sync enkel op verzoek**: geen planning en geen sync zonder open pagina. Chrome vraagt na een herstart soms opnieuw toestemming voor de map (een klik op **Nu synchroniseren** volstaat).
- **Firefox:** geen mapkeuze, dus een zip; tijdelijke installatie; enkel een rooktest gedaan (laadt, haalt het restmenu op, herkent een verlopen sessie), geen volledige tests.
- **Afbeeldingen in aankondigingen** van andere websites dan Ufora worden geblokkeerd (bewust: dat zou je IP-adres aan derden tonen).
- **Opdrachten indienen** ontbreekt bewust (onomkeerbaar).
- Ufora kan zijn API wijzigen; dan moet `src/api.js` mee.

## Privacy en rechten

- Rechten: enkel `https://ufora.ugent.be/*` (je vakken, met je eigen sessie) en `https://hydra.ugent.be/*` (restomenu). Geen `tabs`, `cookies`, `storage`, `downloads` of `webRequest`, geen content scripts, geen externe scripts of lettertypes.
- De CSP van de extensiepagina's laat verzoeken enkel naar die twee hosts toe.
- Alles wat opgeslagen wordt (cache van je vakken, instellingen, syncstatus, de gekozen map) staat in de IndexedDB van de extensie in je browser. **Alle lokale gegevens wissen** staat op de instellingenpagina.
- Er is geen telemetrie, geen account en geen server van ons.
- Dit is een persoonlijk project, niet verbonden aan of goedgekeurd door de UGent. Gebruik het volgens de gebruiksvoorwaarden van de UGent.

## Ontwikkelen

```bash
python tools/sync-shared.py    # kopieert app.js, style.css, theme.js uit ../ufora-sync/web
python tools/build.py          # dist/chrome, dist/firefox en zips
python tests/e2e.py            # echte Chromium met de uitgepakte extensie tegen een nagebootste Ufora
npx web-ext lint -s dist/firefox
```

De frontend is die van [HGU](https://github.com/HenriGoudezeune/ufora-sync) (ongewijzigd, via een kleine URL-hook); alleen `src/*.js` en de html-pagina's zijn van de extensie. `api.js` is een port van de datalaag van `ufora_home.py`, `sync.js` van `ufora_sync.py`. De tests starten Playwrights Chromium (`playwright install chromium`), want branded Chrome 137+ laadt geen extensies via de opdrachtregel meer.

## Licentie

[MIT](LICENSE)
