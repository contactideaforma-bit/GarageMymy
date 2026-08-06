// Garde-fou de DURÉE pour les appels lents (analyse IA d'un PDF).
//
// Pourquoi : sur Vercel, une fonction qui dépasse sa durée maximale est tuée
// par la plateforme, qui répond une PAGE HTML d'erreur. Le navigateur faisait
// alors `res.json()` sur du HTML → « Unexpected token 'A', "An error o"… is
// not valid JSON », message incompréhensible pour l'utilisateur.
//
// On coupe donc NOUS-MÊMES un peu avant la limite, pour toujours répondre un
// JSON propre et un message actionnable.

export class DelaiDepasse extends Error {
  constructor(message = "Délai dépassé.") {
    super(message);
    this.name = "DelaiDepasse";
  }
}

export function avecDelai<T>(promesse: Promise<T>, ms: number, message?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new DelaiDepasse(message)), ms);
    promesse.then(
      (v) => { clearTimeout(minuteur); resolve(v); },
      (e) => { clearTimeout(minuteur); reject(e); }
    );
  });
}
