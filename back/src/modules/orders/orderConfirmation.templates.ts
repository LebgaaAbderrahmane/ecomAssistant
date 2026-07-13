// Templated, not LLM-generated — this is the one message where stated facts
// (product, quantity, total, wilaya, commune) must be exact every time, with nothing
// to interpret from the customer. Returns 1-3 messages split at natural conversational
// boundaries, matching the multi-message format of LLM #2 replies.

interface ConfirmationTemplateInput {
  productName: string;
  quantity: number;
  totalAmount: number;
  currency: string;
  wilaya: string;
  commune: string;
  clientName: string | null;
}

export function buildOrderConfirmationText(
  input: ConfirmationTemplateInput,
  language: string,
): string[] {
  const {
    productName,
    quantity,
    totalAmount,
    currency,
    wilaya,
    commune,
    clientName
  } = input;

  const location = `${commune}, ${wilaya}`;
  const name = clientName ? ` ${clientName}` : '';

  // Algerian Darija (Latin) - default
  if (
    language === "ar-dz" ||
    language === "darija" ||
    language === "auto"
  ) {
    return [
      `Salam${name}, nta li dit 3lina ${quantity} ${productName}?`,
      `Total ja: ${totalAmount} ${currency} w la livraison l ${location}.`,
      `Choufha mlih. Ila kayn kch 7aja khasa ttbadel 9olli, w ila kolchi mli7 nb3toulk la commande.`,
    ];
  }

  // French
  if (language === "fr") {
    return [
      `Bonjour${name}, voici le récapitulatif de votre commande :`,
      `Produit : ${productName}\nQuantité : ${quantity}\nPrix total : ${totalAmount} ${currency}\nLivraison : ${location}`,
      `Vérifiez les informations. S'il y a quelque chose à modifier, dites-le-moi.`,
    ];
  }

  // Arabic (MSA)
  return [
    `مرحباً${name}، هذا ملخص طلبك:`,
    `المنتج: ${productName}\nالكمية: ${quantity}\nالسعر الإجمالي: ${totalAmount} ${currency}\nمكان التوصيل: ${location}`,
    `راجع المعلومات، وإذا كان هناك أي شيء يحتاج إلى تعديل أخبرني به.`,
  ];
}
