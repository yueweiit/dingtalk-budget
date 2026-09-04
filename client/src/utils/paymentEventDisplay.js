function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '';
}

export function paymentEventKey(item) {
  if (item?.accounting_source !== 'payment_event') return '';
  const businessId = firstNonEmpty(item?.business_id, item?.form_no);
  const eventId = firstNonEmpty(item?.payment_event_id, item?.payment_event_paid_at, item?.accounting_at);
  return businessId && eventId ? `${businessId}::${eventId}` : '';
}

export function buildPaymentSequenceMap(rawDetails = []) {
  const groups = new Map();
  for (const item of rawDetails) {
    if (item?.accounting_source !== 'payment_event') continue;
    const businessId = firstNonEmpty(item?.business_id, item?.form_no);
    const key = paymentEventKey(item);
    if (!businessId || !key) continue;
    if (!groups.has(businessId)) groups.set(businessId, []);
    groups.get(businessId).push(item);
  }

  const sequenceMap = new Map();
  for (const items of groups.values()) {
    const uniqueItems = [...new Map(items.map((item) => [paymentEventKey(item), item])).values()];
    uniqueItems.sort((left, right) => (
      String(firstNonEmpty(left?.payment_event_paid_at, left?.accounting_at)).localeCompare(
        String(firstNonEmpty(right?.payment_event_paid_at, right?.accounting_at))
      ) || Number(left?.payment_event_id || 0) - Number(right?.payment_event_id || 0)
    ));
    uniqueItems.forEach((item, index) => sequenceMap.set(paymentEventKey(item), index + 1));
  }
  return sequenceMap;
}

function isFullyDeducted(item) {
  return String(item?.payment_event_evidence_text || '').includes('\u5df2\u5168\u989d\u62b5\u6263');
}

export function buildPaymentCountMap(rawDetails = []) {
  const eventKeysByBusiness = new Map();
  for (const item of rawDetails) {
    if (item?.accounting_source !== 'payment_event') continue;
    const businessId = firstNonEmpty(item?.business_id, item?.form_no);
    const eventKey = paymentEventKey(item);
    if (!businessId || !eventKey) continue;
    if (!eventKeysByBusiness.has(businessId)) eventKeysByBusiness.set(businessId, new Set());
    eventKeysByBusiness.get(businessId).add(eventKey);
  }
  return new Map([...eventKeysByBusiness].map(([businessId, eventKeys]) => [businessId, eventKeys.size]));
}

export function paymentEventLabel(item, sequence = 0, total = 0) {
  if (item?.accounting_source === 'payment_event') {
    if (isFullyDeducted(item)) return '\u5df2\u5168\u989d\u62b5\u6263';
    if (total <= 1) return '\u5b9e\u9645\u4ed8\u6b3e';
    return `${sequence > 0 ? `\u7b2c${sequence}\u671f` : '\u5b9e\u9645'}\u4ed8\u6b3e`;
  }
  return item?.accounting_source === 'completed_approval_fallback' ? '\u5ba1\u6279\u5b8c\u6210\u515c\u5e95' : '';
}

export function paymentEventDate(item) {
  return firstNonEmpty(item?.payment_event_paid_at, item?.accounting_at, item?.approval_completed_at);
}

export function paymentEventEvidence(item) {
  return item?.accounting_source === 'payment_event'
    ? String(item?.payment_event_evidence_text || '').trim()
    : '';
}
