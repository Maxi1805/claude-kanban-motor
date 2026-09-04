package com.example.app;

import com.example.app.util.Helper;
import com.example.app.model.Order;
import java.util.ArrayList;
import java.util.List;

/** Forma real de un consumidor Java: layout Maven, import por paquete completo. */
public class Main {
  private final Helper helper = new Helper();

  public List<String> run(Order order) {
    List<String> out = new ArrayList<>();
    out.add(helper.format(order.getName()));
    // Llamada desnuda a un método hermano: despacho implícito a `this`.
    return decorate(out);
  }

  private List<String> decorate(List<String> raw) {
    return raw;
  }
}
