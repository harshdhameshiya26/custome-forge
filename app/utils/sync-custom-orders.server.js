import db from '../db.server';

export const syncCustomOrdersToBackend = async (orders, shop) => {
  for (const order of orders) {
    const orderId = String(order.rawId || '').trim();
    if (!orderId || !Array.isArray(order.customDesigns) || order.customDesigns.length === 0) {
      continue;
    }

    const metadata = {
      orderNumber: order.id,
      financialStatus: order.financialStatus,
      totalPrice: order.totalPrice || null,
      currency: order.currency || null,
      customerName: order.customerName || null,
      customDesigns: order.customDesigns,
      customLineItems: order.customDesigns.map((design) => ({
        title: design.title,
        quantity: design.quantity,
        variantId: design.variantId || null,
        variantTitle: design.variantTitle || '',
        productImageUrl: design.productImageUrl || null,
        properties: design.properties || {},
        customAttributes: design.properties || {},
      })),
    };

    const existingOrder = await db.customOrder.findFirst({
      where: {
        OR: [{ orderId }, { shopifyOrderId: orderId }],
      },
    });
    const isPaid = String(order.financialStatus || '').toLowerCase() === 'paid';
    const updateData = {
      customerEmail: order.customerEmail || existingOrder?.customerEmail || null,
      productType: order.customDesigns[0].title || 'Custom Product',
      customizationType:
        order.customDesigns[0].properties?.['Text style'] || 'Customer designed',
      shop,
      metadata: {
        ...(existingOrder?.metadata || {}),
        ...metadata,
        ...(isPaid ? { paidAt: existingOrder?.metadata?.paidAt || new Date().toISOString() } : {}),
      },
      ...(isPaid && existingOrder?.status === 'DRAFT'
        ? { status: 'PENDING_APPROVAL' }
        : {}),
    };

    if (existingOrder) {
      await db.customOrder.update({
        where: { id: existingOrder.id },
        data: updateData,
      });
      continue;
    }

    await db.customOrder.upsert({
      where: { orderId },
      create: {
        orderId,
        shopifyOrderId: orderId,
        status: isPaid ? 'PENDING_APPROVAL' : 'DRAFT',
        ...updateData,
      },
      update: updateData,
    });
  }
};
