// Explicit deterministic fixture. It exercises the real writer, preview and browser verifier.
// It is never used as a fallback for an unsuccessful AI request.
export function fixturePlan() {
  return {
    name: 'Atelier local · surplus alimentaires',
    summary:
      'Un parcours simple pour transformer les surplus d’une association en collectes organisées.',
    criteria: [],
    requirements: [],
    unknowns: [
      'Exemple pédagogique : aucun règlement de compétition n’a été vérifié.',
    ],
    ideas: [
      {
        id: 'collecte',
        title: 'Seconde Table',
        concept:
          'Publier un surplus, retrouver les dons disponibles et réserver une collecte.',
        audience: 'Associations de quartier',
        features: [
          'Ajouter un don',
          'Filtrer les disponibilités',
          'Réserver une collecte',
        ],
        fit: 5,
        feasibility: 5,
        originality: 3,
        reason: 'Un parcours complet et utile, testable sans service externe.',
        risks: ['Les données restent sur cet appareil.'],
      },
      {
        id: 'prevision',
        title: 'Prévision Solidaire',
        concept: 'Anticiper les quantités à redistribuer.',
        audience: 'Associations',
        features: ['Historique', 'Prévisions'],
        fit: 4,
        feasibility: 2,
        originality: 4,
        reason: 'Nécessite un historique de données fiable.',
        risks: ['Données historiques absentes.'],
      },
      {
        id: 'carte',
        title: 'Carte des dons',
        concept: 'Cartographier les dons autour de soi.',
        audience: 'Bénévoles',
        features: ['Carte', 'Itinéraires'],
        fit: 4,
        feasibility: 3,
        originality: 3,
        reason: 'Dépend de services de géolocalisation.',
        risks: ['Accès aux services cartographiques.'],
      },
    ],
  };
}
export function fixtureBundle() {
  return {
    files: [
      {
        path: 'index.html',
        content:
          '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seconde Table</title><link rel="stylesheet" href="styles.css"></head><body><header><a href="/">Seconde Table<span>LE DON CONTINUE.</span></a><p>Le quartier partage, rien ne se perd.</p></header><main><div class="intro"><span>LES COLLECTES DU QUARTIER</span><h1>Une seconde chance.<br>Une place à votre table.</h1><p>Des surplus encore bons, des voisins qui en ont besoin.</p></div><div class="layout"><section><div class="list-title"><h2>Les dons</h2><select aria-label="Filtrer les dons" id="filter"><option value="all">Tous les dons</option><option value="available">Disponibles</option><option value="reserved">Réservés</option></select></div><div id="donations" aria-live="polite"></div></section><form id="donate"><span>VOTRE CONTRIBUTION</span><h2>Proposer un don</h2><label for="food">Denrée</label><input id="food" name="food" placeholder="Ex. : paniers de légumes" required maxlength="100"><label for="quantity">Quantité</label><input id="quantity" type="number" min="1" max="1000" value="1" required><button type="submit">Publier le don →</button><p id="message" role="status"></p><small>Vos dons sont conservés dans ce navigateur.</small></form></div></main><footer>Prototype local · données de démonstration</footer><script src="app.js" defer></script></body></html>',
      },
      {
        path: 'styles.css',
        content:
          '*{box-sizing:border-box}body{margin:0;background:#f5f4ef;color:#163c33;font:16px/1.5 Arial,sans-serif}header{padding:25px 6%;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #d7e0d7}header a{font-size:24px;font-weight:bold;color:inherit;text-decoration:none}header a span{display:block;font-size:9px;letter-spacing:3px;font-weight:400}header p{font-size:13px;color:#6f8279}main{max-width:1160px;margin:55px auto;padding:0 30px}.intro>span,form>span{font-size:11px;letter-spacing:2px;color:#6e8278}h1{font-family:Georgia,serif;font-size:54px;line-height:1.08;letter-spacing:-2px;font-weight:400;margin:20px 0}.intro p{color:#78877e;margin-bottom:45px}.layout{display:grid;grid-template-columns:1.4fr 1fr;gap:50px}h2{font-size:20px}.list-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.card{padding:23px 25px;border-radius:10px;background:white;border:1px solid #dce3d9;margin:14px 0;display:flex;align-items:center;gap:20px}.card h3{margin:0;font-size:18px}.card p{font-size:13px;color:#7d8e80;margin:6px 0 0}.card button{margin-left:auto;background:#e6eedc;color:#275548;padding:10px 14px;border:0;border-radius:6px}.reserved{background:#f0f4ee;color:#768878;padding:6px 10px;border-radius:4px;font-size:12px}form{background:#e4eddc;border-radius:13px;padding:30px}form h2{font-family:Georgia,serif;font-size:27px;font-weight:400}label{display:block;font-size:13px;margin:20px 0 7px}input,select{border:1px solid #cbd8c3;border-radius:6px;background:#ffffffad;padding:11px;font:inherit;max-width:100%}input{width:100%}select{font-size:12px}form button{width:100%;border:0;background:#245746;color:white;font-size:14px;padding:14px;border-radius:6px;margin-top:25px}small{font-size:11px;color:#73876a}button{cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #76a988;outline-offset:4px}footer{padding:30px 6%;font-size:12px;color:#869081}#message{font-size:13px}@media(max-width:700px){header p{display:none}h1{font-size:39px}.layout{grid-template-columns:1fr;gap:25px}main{margin-top:35px;padding:0 20px}.card{padding:18px;gap:12px}.card h3{font-size:16px}}',
      },
      {
        path: 'app.js',
        content: `const key='seconde-table-v1';
let donations;try{donations=JSON.parse(localStorage.getItem(key))}catch{}
if(!Array.isArray(donations))donations=[{id:'1',food:'Paniers de légumes',quantity:6,reserved:false},{id:'2',food:'Pains du jour',quantity:12,reserved:false},{id:'3',food:'Compotes maison',quantity:8,reserved:true}];
const list=document.querySelector('#donations'),filter=document.querySelector('#filter');
function save(){try{localStorage.setItem(key,JSON.stringify(donations))}catch{document.querySelector('#message').textContent='Stockage indisponible sur ce navigateur.'}}
function render(){list.replaceChildren();const rows=donations.filter(d=>filter.value==='all'||(filter.value==='reserved'?d.reserved:!d.reserved));if(!rows.length){list.textContent='Aucun don pour ce filtre.';return}for(const d of rows){const card=document.createElement('article');card.className='card';card.dataset.id=d.id;const info=document.createElement('div'),title=document.createElement('h3'),q=document.createElement('p');title.textContent=d.food;q.textContent=d.quantity+' portions · Collecte de quartier';info.append(title,q);card.append(info);if(d.reserved){const tag=document.createElement('span');tag.className='reserved';tag.textContent='Réservé';card.append(tag)}else{const b=document.createElement('button');b.type='button';b.textContent='Réserver';b.setAttribute('aria-label','Réserver '+d.food);b.onclick=()=>{d.reserved=true;save();render()};card.append(b)}list.append(card)}}
document.querySelector('#donate').onsubmit=e=>{e.preventDefault();const food=document.querySelector('#food').value.trim(),quantity=Number(document.querySelector('#quantity').value);if(!food||!Number.isInteger(quantity)||quantity<1||quantity>1000)return;donations.unshift({id:crypto.randomUUID(),food,quantity,reserved:false});save();filter.value='all';render();document.querySelector('#food').value='';document.querySelector('#message').textContent='Votre don a été publié.'};filter.onchange=render;render();`,
      },
      {
        path: 'README.md',
        content:
          '# Seconde Table\n\nPrototype local de coordination de surplus alimentaires.\n\nOuvrir via un serveur statique HTTP. Les données sont conservées dans le navigateur. Aucun envoi réseau, réservation réelle ou partage entre utilisateurs.\n\nLicence MIT.',
      },
    ],
    tests: [
      {
        name: 'Publier un don et le retrouver après rechargement',
        steps: [
          { action: 'fill', selector: '#food', value: 'Pommes du jardin' },
          { action: 'fill', selector: '#quantity', value: '4' },
          { action: 'click', selector: 'button[type="submit"]', value: '' },
          {
            action: 'assertText',
            selector: '#donations',
            value: 'Pommes du jardin',
          },
          { action: 'reload', selector: '', value: '' },
          {
            action: 'assertText',
            selector: '#donations',
            value: 'Pommes du jardin',
          },
        ],
      },
      {
        name: 'Réserver et filtrer les dons disponibles',
        steps: [
          {
            action: 'click',
            selector: 'button[aria-label="Réserver Paniers de légumes"]',
            value: '',
          },
          { action: 'select', selector: '#filter', value: 'reserved' },
          {
            action: 'assertText',
            selector: '#donations',
            value: 'Paniers de légumes',
          },
          { action: 'select', selector: '#filter', value: 'available' },
          {
            action: 'assertText',
            selector: '#donations',
            value: 'Pains du jour',
          },
        ],
      },
    ],
    limitations: [
      'Données locales à un navigateur ; pas de partage multi-utilisateur.',
      'Aucune collecte réelle, messagerie ou intégration externe.',
      'Exemple prédéfini : aucune génération IA.',
    ],
  };
}
