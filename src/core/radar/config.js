/* Paramètres du Radar. Montants en centimes. Chaque seuil est un choix documenté, modifiable ici. */
export const RADAR = {
  maxBudget: 5000,                                  // règle fondamentale : achat prioritaire seulement à 50 € ou moins
  budgets: [1000, 2000, 3000, 4000, 5000],          // filtres « moins de 10 / 20 / 30 / 40 / 50 € »
  weights: { profit: 25, demand: 25, speed: 20, competition: 10, trend: 10, risk: 10 },
  roiFull: 100,        // ROI (%) qui donne la note maximale de rentabilité
  netFull: 800,        // bénéfice net (8 €) qui donne la note maximale de rentabilité
  minNetFloor: 100,    // bénéfice net minimum retenu pour les prix d'achat conseillés (au moins ce montant)
  idealRoi: 50,        // prix d'achat idéal : celui qui laisse au moins 50 % de ROI au prix réaliste
  trend: {
    recent: { day: 14, week: 8, month: 3 },         // nombre de points de la période récente
    baseline: { day: 90, week: 26, month: 12 },     // nombre de points de comparaison précédant la période récente
    rising: 1.25, falling: 0.8, spike: 0.6, persistence: 0.7,
  },
  freshness: { fresh: 14, stale: 30 },              // jours : au-delà de « stale », l'analyse n'est plus considérée comme actuelle
  minSalesForSpeed: 3,                              // ventes réelles minimum pour parler de vitesse
  speedFullDays: 7, speedZeroDays: 60,
  competitionFull: 20, competitionZero: 200,        // annonces actives similaires : 20 ou moins = faible, 200 ou plus = forte
  demandSalesFull: 8,
  bands: ['Peu intéressante', 'À surveiller', 'Intéressante', 'Très bonne opportunité', 'Opportunité exceptionnelle'],
  bandMins: [0, 60, 70, 80, 90],
  minSalesForCalibration: 5, calibrationBounds: [0.85, 1.15],
};
