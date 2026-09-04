class OrderFacade {
  constructor(
    private payment: PaymentGateway,
    private inventory: InventoryService,
    private shipping: ShippingProvider,
    private notifier: NotificationCenter,
  ) {}

  process(order: Order) {
    this.payment.charge(order.total);
    this.inventory.reserve(order.items);
    this.shipping.schedule(order.date);
    this.notifier.sendConfirmation();
  }
}
