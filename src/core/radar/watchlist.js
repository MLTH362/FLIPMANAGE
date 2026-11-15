/* Liste de départ des familles de produits suivies automatiquement (modifiable par l'utilisateur à l'étape suivante).
   ATTENTION : cette liste est ÉDITORIALE. Les noms, catégories, tailles et risques de contrefaçon sont des estimations,
   et les titres d'articles Wikipedia n'ont pas pu être vérifiés hors ligne : un titre introuvable donne « not_found »,
   jamais de données inventées. Seules les pages vues (API Wikimedia) sont des mesures. Aucun prix n'est fourni ici. */
const w = (name, wiki, category, sizeClass, counterfeitRisk) => ({ id: wiki.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, wiki, category, sizeClass, counterfeitRisk, editorial: true });

export const WATCHLIST = [
  w('Game Boy', 'Game Boy', 'Jeux vidéo', 'petit', 'faible'), w('Game Boy Color', 'Game Boy Color', 'Jeux vidéo', 'petit', 'faible'),
  w('Game Boy Advance', 'Game Boy Advance', 'Jeux vidéo', 'petit', 'faible'), w('Nintendo DS', 'Nintendo DS', 'Jeux vidéo', 'petit', 'faible'),
  w('PlayStation Portable', 'PlayStation Portable', 'Jeux vidéo', 'petit', 'faible'), w('Game Gear', 'Game Gear', 'Jeux vidéo', 'petit', 'faible'),
  w('Tamagotchi', 'Tamagotchi', 'Jouets', 'petit', 'moyen'), w('Furby', 'Furby', 'Jouets', 'petit', 'faible'),
  w('Polly Pocket', 'Polly Pocket', 'Jouets', 'petit', 'faible'), w('Beyblade', 'Beyblade', 'Jouets', 'petit', 'faible'),
  w('Hot Wheels', 'Hot Wheels', 'Jouets', 'petit', 'faible'), w('Playmobil', 'Playmobil', 'Jouets', 'moyen', 'faible'), w('Lego', 'Lego', 'Jouets', 'moyen', 'faible'),
  w('Cartes Pokémon', 'Pokémon (jeu de cartes à collectionner)', 'Cartes à collectionner', 'petit', 'moyen'), w('Yu-Gi-Oh!', 'Yu-Gi-Oh!', 'Cartes à collectionner', 'petit', 'moyen'),
  w('Walkman', 'Walkman', 'Audio', 'petit', 'faible'), w('iPod', 'IPod', 'Audio', 'petit', 'faible'),
  w('Crocs', 'Crocs', 'Mode', 'moyen', 'moyen'), w('Birkenstock', 'Birkenstock', 'Mode', 'moyen', 'moyen'), w('Dr. Martens', 'Dr. Martens', 'Mode', 'moyen', 'moyen'),
  w('Carhartt', 'Carhartt', 'Mode', 'moyen', 'moyen'), w('Casio', 'Casio', 'Montres', 'petit', 'moyen'), w('Swatch', 'Swatch', 'Montres', 'petit', 'moyen'),
  w('Thermomix', 'Thermomix', 'Maison', 'grand', 'faible'), w('Opinel', 'Opinel', 'Maison', 'petit', 'faible'),
];
