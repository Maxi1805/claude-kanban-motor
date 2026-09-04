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


// --- POSITIVO (mutacion A: clone-duplicate) ---
type OrderFacade2 struct {
	Payment   *PaymentGateway
	Inventory *InventoryService
	Shipping  *ShippingProvider
	Notifier  *NotificationCenter
}

func (f *OrderFacade2) Process(order Order) {
	f.Payment.Charge(order.Total)
	f.Inventory.Reserve(order.Items)
	f.Shipping.Schedule(order.Date)
	f.Notifier.SendConfirmation()
}

