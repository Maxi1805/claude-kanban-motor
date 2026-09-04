// POSITIVO (mutación B: sin Facade; secuencia repetida en 2 llamadores).
function checkout(order: Order, payment: PaymentGateway, inventory: InventoryService, shipping: ShippingProvider, notifier: NotificationCenter): void {
  payment.charge(order.total);
  inventory.reserve(order.items);
  shipping.schedule(order.date);
  notifier.sendConfirmation();
}
function checkoutExpress(order: Order, payment: PaymentGateway, inventory: InventoryService, shipping: ShippingProvider, notifier: NotificationCenter): void {
  payment.charge(order.total);
  inventory.reserve(order.items);
  shipping.schedule(order.date);
  notifier.sendConfirmation();
}
