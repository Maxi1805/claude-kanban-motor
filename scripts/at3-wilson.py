#!/usr/bin/env python3
"""Intervalo de Wilson al 95 %. Uso: at3-wilson.py <verdaderas> <juzgadas>"""
import sys, math
k, n = int(sys.argv[1]), int(sys.argv[2])
if n == 0: print("n=0"); sys.exit()
z = 1.96; p = k / n
den = 1 + z*z/n
c = (p + z*z/(2*n)) / den
h = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n)) / den
print(f"{k}/{n} = {100*p:.1f} %   Wilson 95 %: [{100*max(0,c-h):.1f} %, {100*min(1,c+h):.1f} %]")
