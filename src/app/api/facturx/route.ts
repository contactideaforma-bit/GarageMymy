import { NextResponse } from "next/server";
import { PDFDocument, PDFName, PDFString, PDFHexString, AFRelationship } from "pdf-lib";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";

// ============================================================
//  FACTUR-X — incrustation du XML dans le PDF (v52).
//
//  Reçoit le PDF de la facture (généré dans le navigateur par jsPDF) et
//  le XML CII (lib/facturx.ts), renvoie le PDF avec :
//    · le fichier « factur-x.xml » attaché (AFRelationship = Data) ;
//    · les métadonnées XMP Factur-X (profil BASIC) et l'identifiant
//      PDF/A-3 attendus par les plateformes et les lecteurs.
//
//  Limite connue (étape 2) : jsPDF n'embarque pas ses polices standard,
//  la conformité PDF/A-3 stricte n'est donc pas garantie par un
//  validateur (veraPDF). Le XML, lui, est complet et lisible par toute
//  plateforme agréée.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 30;

function xmp(numero: string, date: string): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">Facture ${numero}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>My Easy Auto</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>My Easy Auto (jsPDF + pdf-lib)</pdf:Producer>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>My Easy Auto</xmp:CreatorTool>
      <xmp:CreateDate>${date}</xmp:CreateDate>
      <xmp:ModifyDate>${date}</xmp:ModifyDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description></rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>BASIC</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  let body: { pdf?: string; xml?: string; numero?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!body.pdf || !body.xml) {
    return NextResponse.json({ error: "PDF ou XML manquant." }, { status: 400 });
  }
  if (body.pdf.length > 12_000_000) {
    return NextResponse.json({ error: "PDF trop volumineux." }, { status: 413 });
  }

  try {
    const pdfDoc = await PDFDocument.load(Buffer.from(body.pdf, "base64"), { updateMetadata: false });
    const xmlBytes = Buffer.from(body.xml, "utf8");
    const maintenant = new Date();

    await pdfDoc.attach(xmlBytes, "factur-x.xml", {
      mimeType: "text/xml",
      description: "Factur-X XML invoice (profile BASIC)",
      creationDate: maintenant,
      modificationDate: maintenant,
      afRelationship: AFRelationship.Data,
    });

    // Métadonnées XMP (identifiant PDF/A-3 + schéma Factur-X)
    const xmpStr = xmp(body.numero || "", maintenant.toISOString());
    const metaStream = pdfDoc.context.stream(Buffer.from(xmpStr, "utf8"), {
      Type: "Metadata",
      Subtype: "XML",
      Length: Buffer.byteLength(xmpStr, "utf8"),
    });
    pdfDoc.catalog.set(PDFName.of("Metadata"), pdfDoc.context.register(metaStream));

    // Informations classiques du document
    pdfDoc.setTitle(`Facture ${body.numero || ""}`.trim());
    pdfDoc.setProducer("My Easy Auto (jsPDF + pdf-lib)");
    pdfDoc.setCreator("My Easy Auto");
    pdfDoc.setModificationDate(maintenant);

    // Identifiant unique (recommandé PDF/A)
    const id = PDFHexString.of(Buffer.from(`${body.numero || ""}-${maintenant.getTime()}`).toString("hex").padEnd(32, "0").slice(0, 32));
    pdfDoc.context.trailerInfo.ID = pdfDoc.context.obj([id, id]);
    void PDFString; // (import conservé pour d'éventuelles métadonnées textuelles)

    const sortie = await pdfDoc.save({ useObjectStreams: false });
    return NextResponse.json({ pdf: Buffer.from(sortie).toString("base64") });
  } catch (err) {
    console.error("[facturx]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Incrustation Factur-X impossible." },
      { status: 500 }
    );
  }
}
