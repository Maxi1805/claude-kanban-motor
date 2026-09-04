package orders

type OrderFacade struct {
	Payment   *PaymentGateway
	Inventory *InventoryService
	Shipping  *ShippingProvider
	Notifier  *NotificationCenter
}

func (f *OrderFacade) Process(order Order) {
	f.Payment.Charge(order.Total)
	f.Inventory.Reserve(order.Items)
	f.Shipping.Schedule(order.Date)
	f.Notifier.SendConfirmation()
}
