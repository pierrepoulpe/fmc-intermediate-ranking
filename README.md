# TCR No12 — classement « distance au prochain CP »

Pendant la Transcontinental Race, le classement officiel ne bouge qu'au **passage d'un point
de contrôle (CP)** — alors qu'il peut y avoir ~2000 km entre deux CP. Cet outil reconstruit un
**classement continu** basé sur la progression réelle de chaque coureur vers son prochain point.

Il s'affiche **par-dessus la carte officielle Follow My Challenge**, directement dans ton
navigateur de téléphone.

---

## 🚀 Guide d'installation pas à pas (pour tout le monde)

Il faut 3 briques : un **navigateur qui accepte les extensions** (Firefox), une **extension qui
sait lancer des petits scripts** (Tampermonkey), et enfin **le script** de classement. Compter ~5 min,
une seule fois.

### 1. Installer Firefox

Le navigateur Chrome par défaut d'Android **ne gère pas les extensions** : impossible d'y faire
tourner le script. Firefox, si.

1. Ouvre le **Play Store** (Android) ou l'**App Store** (iPhone).
2. Cherche **« Firefox »** (éditeur *Mozilla*), installe-le, ouvre-le.

### 2. Installer l'extension Tampermonkey

Tampermonkey est un « gestionnaire de userscripts » : c'est lui qui exécutera le classement sur
la page de la course.

1. Dans Firefox, touche le menu **⋮** (en bas à droite) → **Modules complémentaires** (ou
   *Extensions*).
2. Cherche **« Tampermonkey »**, touche **Ajouter à Firefox**, puis **Autoriser / Ajouter**.
3. Une petite icône Tampermonkey apparaît dans la barre de Firefox : l'extension est prête.

### 3. Installer le script de classement

1. Dans Firefox, ouvre ce lien (c'est le script) :

   ```
   https://raw.githubusercontent.com/pierrepoulpe/fmc-intermediate-ranking/main/ranking.user.js
   ```

2. Tampermonkey affiche une page d'installation → touche **Installer** (ou *Mettre à jour* si
   une version est déjà présente).

### 4. Utiliser

1. Ouvre la carte de la course : `https://www.followmychallenge.com/live/tcrno12/`
2. Laisse la carte se charger.
3. Un **bouton rouge 🏁** apparaît en bas à droite → touche-le : le classement s'ouvre.
4. Tape ton **nom ou ton dossard** dans le champ de recherche : ta ligne se surligne en vert et
   l'écran défile jusqu'à elle, au fur et à mesure de la frappe.

Le classement **se rafraîchit tout seul toutes les 20 s** tant que le panneau est ouvert.

### Mettre à jour le script plus tard

Rouvre simplement **le lien de l'étape 3** dans Firefox : Tampermonkey proposera *Mettre à jour*.
Le numéro de `@version` affiché confirme que la nouvelle version est bien prise.

> ℹ️ **Sur iPhone**, Firefox ne propose pas Tampermonkey de la même façon : il faut passer par
> l'application **Userscripts** (gratuite, App Store) reliée à Safari, puis y ajouter le même lien.
> Sur Android, la voie Firefox + Tampermonkey ci-dessus est la plus simple.

---

## Comment ça marche (détails techniques)

### Pourquoi un script côté navigateur ?

- Le tracker officiel du TCRNo12 est **Follow My Challenge** (`followmychallenge.com/live/tcrno12/`).
- Le site est protégé par un mur anti-bot **Cloudflare** (challenge JavaScript) ; DotWatcher.cc
  (alimenté par FMC) l'est aussi (Vercel). Impossible d'aspirer les données depuis un serveur.
- En revanche, **ton navigateur** franchit ce challenge normalement. Le calcul tourne donc
  **dans la page**, là où les données sont déjà chargées (`window.participantMarkers`).

### Les bornes

La TCR est en **itinéraire libre** entre des **parcours obligatoires**. On ne connaît donc pas la
route exacte de chaque coureur → on raisonne **à vol d'oiseau**. Les points de passage (« bornes »)
sont : les **4 CP officiels** + le **début et la fin de chaque parcours obligatoire**, extraits de
`itineraire.toml` et des extrémités des GPX (repo `ultrarouter`). Doublons < 1,5 km fusionnés.
**18 bornes**, ~3403 km à vol d'oiseau au total.

### La méthode

- Chaque coureur est **projeté** sur la polyligne des bornes (projection équirectangulaire locale)
  → on en déduit sa **prochaine borne** et sa progression.
- La **distance affichée est à vol d'oiseau** (haversine) vers la prochaine borne et vers le
  prochain CP officiel — approximation assumée.
- **Tri** : d'abord la borne suivante la plus avancée dans la course, puis, à borne égale, le
  **vol d'oiseau croissant** vers cette borne (le plus proche devant).
- Les coureurs très éloignés de la ligne théorique (sur un connecteur libre) sont signalés « ≈ » :
  leur position dans le classement est plus approximative.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `ranking.user.js` | **Le classement** (userscript à installer). |
| `probe.user.js` | Sonde de diagnostic (userscript) — a servi à découvrir la structure des données de FMC. Inutile à l'usage normal. |
| `probe.js` / `probe.bookmarklet.txt` | Première version de la sonde, en bookmarklet. Historique. |
| `bornes.generated.txt` | Liste des 18 bornes générée depuis `itineraire.toml` + GPX. |

> Si le panneau indique moins de 3 coureurs localisés, il affiche un **diagnostic** (bouton 🔧,
> puis *Copier*) : structure réelle des marqueurs, utile pour corriger la lecture des positions.
