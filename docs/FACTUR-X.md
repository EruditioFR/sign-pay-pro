# Factur-X / EN 16931 — Référence technique

Ce document décrit comment `sign-pay-pro` génère et valide des factures
électroniques au format **Factur-X** (XML CII embarquable dans un PDF/A-3,
profil par défaut **EN 16931**).

## Architecture

| Module                                  | Rôle                                                          |
| --------------------------------------- | ------------------------------------------------------------- |
| `src/lib/einvoice.ts`                   | Constantes (profils, codes UN/CEFACT, machine d'état)         |
| `src/lib/einvoice-xml.functions.ts`     | Génération du XML CII + server-fn `generateInvoiceCii`        |
| `src/lib/einvoice-validation.ts`        | Validation métier (SIRET, TVA, adresses, totaux, mentions)    |
| `src/lib/__tests__/einvoice-*.test.ts`  | Couverture : standard, franchise, multi-lignes, remises, avoirs |

## Pipeline serveur (`generateInvoiceCii`)

1. Charge la facture, l'organisation, les lignes et la ventilation TVA.
2. **Validation legacy** `checkEinvoiceReadiness` (présence brute).
3. **Validation Factur-X complète** `validateFacturXInput` :
   - SIRET (14 chiffres + clé Luhn) émetteur & acheteur
   - N° TVA intra `FRxx + 9 chiffres SIREN`
   - Adresse postale complète (BG-5 / BG-8)
   - Cohérence `HT + TVA = TTC` (tolérance ±0,01 €)
   - Cohérence `Σ lignes = HT` et `Σ TVA ventilée = total TVA`
   - Motif d'exonération obligatoire pour catégories `E / AE / K / G / O`
   - Échéance B2B (avertissement art. L441-9 C. commerce)
   - IBAN du bénéficiaire pour virement (`30`, `58`)
   - Cohérence du signe pour les avoirs (type `381` / `384`)
4. Si `strict = true` (défaut) et qu'il existe au moins une erreur → **throw**
   avec message lisible :
   ```
   Facture non conforme Factur-X (2 erreur(s)) :
     • [BR-CO-15] Incohérence des totaux : HT (1000.00) + TVA (200.00) = 1200.00 ≠ TTC (1500.00)
     • [BR-E-10] Ventilation 1 (catégorie E) : motif d'exonération obligatoire …
   ```
5. Construction du XML CII (`buildCiiXml`).
6. Validation structurelle légère (`validateCiiXmlStructure`) — substitut au
   XSD officiel non chargeable dans le runtime workerd.
7. Mise à jour `einvoice_status = 'ready'` et journalisation dans
   `einvoice_events`.

## Codes d'erreur émis

| Code              | Champ                          | Type    | Origine            |
| ----------------- | ------------------------------ | ------- | ------------------ |
| BR-02 … BR-11     | identifiants / adresses        | error   | EN 16931           |
| BR-CO-10 … BR-CO-18 | cohérence totaux & ventilation | error   | EN 16931 (calc.)   |
| BR-E-10 / BR-S-05 | TVA exonérée / standard        | error   | EN 16931           |
| FR-SIRET-*        | SIRET émetteur / acheteur      | error   | spécifique FR      |
| FR-TVA-*          | numéro TVA intracommunautaire  | error   | spécifique FR      |
| FR-CREDIT-SIGN    | signe des montants pour avoir  | warning | spécifique FR      |
| FR-DUE / FR-2026  | échéance / SIRET buyer réforme | warning | spécifique FR      |

## Cas couverts par les tests

`src/lib/__tests__/einvoice-validation.test.ts`

1. Facture standard B2B avec TVA 20 % — passe la validation
2. Facture **franchise en base** (art. 293 B CGI) — TVA 0, catégorie `E`,
   motif d'exonération requis
3. Facture **multi-lignes** avec deux taux (20 % + 5,5 %)
4. Facture avec **remise globale** modélisée en ligne négative
5. **Avoir** (type 381) — montants négatifs, échéance optionnelle
6. **Autoliquidation** (catégorie `AE`) — exonération requise

---

## Exemple 1 — Facture standard EN 16931 (UN/CEFACT CII)

> Émetteur français, acheteur français, TVA 20 %, paiement par virement.
> Sortie réelle de `buildCiiXml`, simplifiée pour la lecture.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>FAC-2026-0001</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">20260615</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>Prestation de conseil</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>100.00</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="HUR">10</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>20.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>1000.00</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>Acme SAS</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0009">73282932000074</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>75001</ram:PostcodeCode>
          <ram:LineOne>1 rue de Paris</ram:LineOne>
          <ram:CityName>Paris</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">FR40303265045</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>Client SARL</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0009">55208131766522</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>75116</ram:PostcodeCode>
          <ram:LineOne>5 avenue Foch</ram:LineOne>
          <ram:CityName>Paris</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>FR7630006000011234567890189</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>200.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>1000.00</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>20.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>30 jours net</ram:Description>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">20260715</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>1000.00</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>1000.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">200.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>1200.00</ram:GrandTotalAmount>
        <ram:DuePayableAmount>1200.00</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
```

## Exemple 2 — Facture en franchise en base (art. 293 B CGI)

> Auto-entrepreneur / micro-entreprise. Pas de TVA collectée, mention
> légale **obligatoire** dans `<ram:ExemptionReason>`.

Différences avec l'exemple 1 :

```xml
  <ram:ApplicableTradeTax>
    <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
    <ram:TypeCode>VAT</ram:TypeCode>
    <ram:ExemptionReason>TVA non applicable, art. 293 B du CGI</ram:ExemptionReason>
    <ram:BasisAmount>500.00</ram:BasisAmount>
    <ram:CategoryCode>E</ram:CategoryCode>
    <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>
  </ram:ApplicableTradeTax>
  …
  <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    <ram:LineTotalAmount>500.00</ram:LineTotalAmount>
    <ram:TaxBasisTotalAmount>500.00</ram:TaxBasisTotalAmount>
    <ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>
    <ram:GrandTotalAmount>500.00</ram:GrandTotalAmount>
    <ram:DuePayableAmount>500.00</ram:DuePayableAmount>
  </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
```

Sans le `<ram:ExemptionReason>`, `validateFacturXInput` rejette avec
`[BR-E-10]` et l'export est bloqué côté serveur en mode `strict`.

## Mentions légales FR couvertes par la validation

- Numéro de facture séquentiel et unique (BT-1) — vérifié par
  `document-numbering.ts`
- Date d'émission (BT-2) — obligatoire
- Identité émetteur : raison sociale (BT-27), SIRET (BT-30 schemeID `0009`),
  numéro TVA si assujetti (BT-31)
- Identité acheteur : raison sociale (BT-44), SIRET (BT-47) recommandé en
  prévision de la réforme 2026/2027
- Adresses postales complètes émetteur (BG-5) et acheteur (BG-8)
- Description, quantité, prix unitaire HT par ligne (BG-25)
- Taux et montant TVA par taux (BG-23) + motif si exonération (BT-120)
- Total HT (BT-109), total TVA (BT-110), total TTC (BT-112)
- Date d'échéance (BT-9) ou indication de paiement comptant
- Coordonnées bancaires pour virement (BT-84 IBAN, BT-86 BIC)

## Limites connues

- Le runtime workerd ne permet pas de charger le XSD officiel CII : la
  validation structurelle est un substitut (présence des balises clés +
  équilibrage). Pour un contrôle XSD/Schematron complet, prévoir un service
  externe (Mustangproject, FNFE-MPE validator).
- Le PDF/A-3 d'enrobage Factur-X n'est pas généré ici : l'export livre le
  XML CII brut, prêt à être attaché.
- Pas encore d'appel PDP — l'envoi reste manuel via la file admin
  `_authenticated.admin.pdp-queue`.
