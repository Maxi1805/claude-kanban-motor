using System;

namespace App.Services
{
    public class OrderService
    {
        public int Load(int id)
        {
            return Normalize(id);
        }

        private int Normalize(int raw)
        {
            return raw * 2;
        }
    }
}
