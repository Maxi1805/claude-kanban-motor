using System;
// Namespace pelado: relación 1-a-N, no resuelve a UN archivo (waiver vigente).
using App.Services;
// Formas que nombran un TIPO: relación 1-a-1, sí resuelven.
using static App.Services.OrderService;
using Svc = App.Services.OrderService;

namespace App
{
    // Forma real de un archivo C# de biblioteca (estilo Newtonsoft.Json):
    // `using` de namespace arriba de todo, namespace de bloque, llamadas con y sin receptor.
    public class Program
    {
        private readonly OrderService _service;

        public Program(OrderService service)
        {
            _service = service;
        }

        public int Run(int id)
        {
            var order = _service.Load(id);
            return Compute(order);
        }

        private int Compute(int value)
        {
            return value + 1;
        }
    }
}
