// Export Excel (.xlsx) natif, sans dépendance supplémentaire : on assemble
// nous-mêmes un classeur OOXML minimal et on le zippe avec JSZip (déjà présent
// pour l'archivage). Fichier .xlsx VRAI (pas un CSV renommé) qui s'ouvre dans
// Excel, Numbers et LibreOffice, avec en-tête coloré, colonnes dimensionnées,
// 1re ligne figée, filtre automatique et montants numériques (sommables).

import JSZip from "jszip";

export type ColonneExcel = {
  header: string;
  // Clé de lecture dans chaque ligne (objet).
  key: string;
  // "text" (défaut), "number" (nombre brut) ou "euro" (nombre + format € FR).
  type?: "text" | "number" | "euro";
  // Largeur de colonne (en « caractères » Excel).
  width?: number;
};

// Échappe les caractères réservés du XML.
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Numéro de colonne (1-based) → lettre(s) Excel : 1→A, 27→AA…
function colonneLettre(n: number): string {
  let s = "";
  while (n > 0) {
    const reste = (n - 1) % 26;
    s = String.fromCharCode(65 + reste) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

// s=0 normal · s=1 en-tête (gras, blanc sur violet) · s=2 montant € FR.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF7C5CF6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${esc(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function celluleNombre(ref: string, valeur: number, euro: boolean): string {
  const style = euro ? ' s="2"' : "";
  const v = Number.isFinite(valeur) ? valeur : 0;
  return `<c r="${ref}"${style}><v>${v}</v></c>`;
}

function celluleTexte(ref: string, valeur: string, entete: boolean): string {
  const style = entete ? ' s="1"' : "";
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(valeur)}</t></is></c>`;
}

function worksheetXml<T extends Record<string, unknown>>(
  colonnes: ColonneExcel[],
  lignes: T[]
): string {
  const nbCols = colonnes.length;
  const nbLignes = lignes.length + 1; // + en-tête
  const derniereCol = colonneLettre(nbCols);

  // Largeurs de colonnes.
  const cols = colonnes
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join("");

  // Ligne d'en-tête.
  const enTete = colonnes
    .map((c, i) => celluleTexte(`${colonneLettre(i + 1)}1`, c.header, true))
    .join("");

  // Lignes de données.
  const corps = lignes
    .map((ligne, idx) => {
      const r = idx + 2; // les données commencent ligne 2
      const cells = colonnes
        .map((c, i) => {
          const ref = `${colonneLettre(i + 1)}${r}`;
          const brut = ligne[c.key];
          if (c.type === "number" || c.type === "euro") {
            const nombre =
              typeof brut === "number"
                ? brut
                : brut == null || brut === ""
                  ? NaN
                  : Number(brut);
            if (!Number.isFinite(nombre)) return celluleTexte(ref, "", false);
            return celluleNombre(ref, nombre, c.type === "euro");
          }
          const texte = brut == null ? "" : String(brut);
          return celluleTexte(ref, texte, false);
        })
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData><row r="1">${enTete}</row>${corps}</sheetData>
<autoFilter ref="A1:${derniereCol}${nbLignes}"/>
</worksheet>`;
}

/**
 * Construit et télécharge un vrai fichier .xlsx.
 * @param nomFichier nom sans extension (l'ajout de « .xlsx » est automatique)
 * @param nomFeuille nom de l'onglet (≤ 31 caractères)
 * @param colonnes   définition des colonnes
 * @param lignes     données (tableau d'objets indexés par `key`)
 */
export async function exporterXlsx<T extends Record<string, unknown>>(
  nomFichier: string,
  nomFeuille: string,
  colonnes: ColonneExcel[],
  lignes: T[]
): Promise<void> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.folder("_rels")!.file(".rels", RELS);
  const xl = zip.folder("xl")!;
  xl.file("workbook.xml", workbookXml(nomFeuille));
  xl.file("styles.xml", STYLES);
  xl.folder("_rels")!.file("workbook.xml.rels", WORKBOOK_RELS);
  xl.folder("worksheets")!.file("sheet1.xml", worksheetXml(colonnes, lignes));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier.endsWith(".xlsx") ? nomFichier : `${nomFichier}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
