# Synchronisation Firebase : plus de fichiers de sauvegarde à envoyer

Avec Firebase, vos données (articles, photos, ventes, études, annonces, paramètres) sont enregistrées dans votre compte Google Firebase
à chaque modification, et retrouvées sur n'importe quel appareil. C'est **gratuit et sans carte bancaire** (offre « Spark »).
Le site reste hébergé sur GitHub Pages : seules les données vont dans Firebase.

## Mise en place (une seule fois, environ 10 minutes)

**1. Créer le projet.** Allez sur https://console.firebase.google.com → « Créer un projet » → donnez un nom (ex. flipmanager) →
désactivez Google Analytics → créez. Restez sur l'offre **Spark** (gratuite, proposée par défaut).

**2. Créer la base.** Menu « Build » → « Firestore Database » → « Créer une base de données » → région Europe (ex. `eur3` ou `europe-west`)
→ **mode production**.

**3. Copier les règles de sécurité.** Firestore → onglet « Règles » → remplacez tout par le contenu du fichier `firestore.rules`
de ce dossier → « Publier ». Ces règles garantissent que chaque compte ne voit que ses propres données.

**4. Activer la connexion Google.** Menu « Authentication » → « Commencer » → « Google » → activer → choisissez votre adresse e-mail
d'assistance → enregistrer.

**5. Autoriser votre site.** Authentication → « Paramètres » → « Domaines autorisés » → « Ajouter un domaine » →
`VOTRE-NOM.github.io` (sans `https://` ni chemin). `localhost` est déjà autorisé pour les essais sur votre ordinateur.

**6. Récupérer la configuration.** Roue dentée « Paramètres du projet » → « Vos applications » → icône web `</>` → donnez un nom → enregistrer
→ copiez les valeurs `apiKey`, `authDomain`, `projectId`, `appId` dans **`src/firebase-config.js`** (remplacez `COLLEZ_ICI_VOTRE_CLE` et
les valeurs vides). Ces valeurs ne sont pas secrètes : la protection vient de la connexion et des règles.

**7. Installer et essayer.**
```
npm install
npm run dev
```
Ouvrez Paramètres → « Synchronisation cloud » → « Se connecter avec Google ». Puis :
1. Cliquez sur **« Envoyer les données de cet ordinateur vers le cloud »** (une seule fois : cela copie vos articles, photos, ventes… dans le cloud).
2. Cliquez sur **« Tester la synchronisation »** : « Synchronisation opérationnelle » confirme que tout fonctionne.

**8. Publier.** Envoyez le dossier sur GitHub (branche `main`) : le site se met à jour. Sur chaque appareil, ouvrez le site et connectez-vous :
vos données apparaissent, sans aucun fichier à importer.

## Au quotidien

- Chaque ajout ou modification est envoyé automatiquement. Le bas de la barre latérale indique l'état : synchronisé, en cours, hors ligne, erreur.
- **Hors ligne**, l'application continue de fonctionner et envoie les modifications au retour du réseau.
- Deux appareils : un onglet qui revient au premier plan après plus d'une minute recharge les données.
- Évitez de modifier **le même élément** sur deux appareils en même temps hors ligne : la dernière modification envoyée l'emporte.
- Les sauvegardes `.json` restent disponibles (Paramètres) comme filet de sécurité supplémentaire.

## Limites gratuites (offre Spark, à vérifier sur la page tarifs de Firebase)

Firestore : environ 1 Go de stockage, 50 000 lectures et 20 000 écritures par jour. L'usage personnel de FLIPMANAGER en consomme une infime partie.
Les photos sont compressées (1200 px) puis stockées dans Firestore : environ 5 000 photos tiennent dans 1 Go.
**N'activez pas « Cloud Storage »** : il exige désormais une offre payante, et FLIPMANAGER n'en a pas besoin.
Si un quota gratuit est dépassé, Firebase refuse simplement les opérations jusqu'au lendemain : vous ne payez jamais sur l'offre Spark.

## Option : réserver la base à votre seul compte

Par défaut, n'importe quel compte Google qui ouvre votre site obtient *son propre* espace vide (il ne voit jamais vos données), mais consomme
vos quotas. Pour l'éviter, remplacez la condition des règles par :
`request.auth != null && request.auth.uid == userId && request.auth.token.email == 'votre.adresse@gmail.com'`

## En cas de problème

| Message | Cause probable |
|---|---|
| « Domaine non autorisé » | Étape 5 : ajoutez `VOTRE-NOM.github.io` aux domaines autorisés |
| « accès refusé » ou échec du test | Étape 3 : règles non publiées, ou mauvais `projectId` dans `firebase-config.js` |
| Aucune carte de synchronisation active | `firebase-config.js` encore avec `COLLEZ_ICI…` : l'application reste en mode local |
| Données vides après connexion | Normal avant l'envoi de l'étape 7 : cliquez sur « Envoyer les données de cet ordinateur » |
