<script>
class OrderFacade {
  constructor(payment, inventory, shipping, notifier) {
    this.payment = payment;
    this.inventory = inventory;
    this.shipping = shipping;
    this.notifier = notifier;
  }

  process(order) {
    this.payment.charge(order.total);
    this.inventory.reserve(order.items);
    this.shipping.schedule(order.date);
    this.notifier.sendConfirmation();
  }
}
</script>
<template><div /></template>
