// Templated, not LLM-generated — this is the one message where stated facts
// (product, quantity, total, wilaya) must be exact every time, with nothing
// to interpret from the customer. Swap for an LLM #2 call later if you want
// tone variation instead of a fixed template.

interface ConfirmationTemplateInput {
  productName: string;
  quantity: number;
  totalAmount: number;
  currency: string;
  wilaya: string;
  commune?: string | null;
  address: string;
  clientName: string | null;
}

export function buildOrderConfirmationText(
  input: ConfirmationTemplateInput,
  language: string,
): string {
  const {
    productName,
    quantity,
    totalAmount,
    currency,
    wilaya,
    commune,
    address,
    clientName
  } = input;

  const location = commune ? `${commune}, ${wilaya}` : wilaya;

  // Algerian Darija (Latin) - default
  if (
    language === "ar-dz" ||
    language === "darija" ||
    language === "auto"
  ) {
    return `Salam ${clientName ? clientName : ''}, nta li dit 3lina ${quantity} ${productName} ? total ja: ${totalAmount} ${currency} w la livraison l  ${location} ${address} Choufha mlih. Ila kayn kch 7aja khasa ttbadel 9olli, w ila kolchi mli7 nb3toulk la commande.`;
  }

  // French
  if (language === "fr") {
    return `Bonjour,

Voici le récapitulatif de votre commande :

Produit : ${productName}
Quantité : ${quantity}
Prix total : ${totalAmount} ${currency}
Livraison : ${location}
Adresse : ${address}

Vérifiez les informations. S'il y a quelque chose à modifier, dites-le-moi.`;
  }

  // Arabic (MSA)
  return `مرحباً،

هذا ملخص طلبك:

المنتج: ${productName}
الكمية: ${quantity}
السعر الإجمالي: ${totalAmount} ${currency}
مكان التوصيل: ${location}
العنوان: ${address}

راجع المعلومات، وإذا كان هناك أي شيء يحتاج إلى تعديل أخبرني به.`;
}