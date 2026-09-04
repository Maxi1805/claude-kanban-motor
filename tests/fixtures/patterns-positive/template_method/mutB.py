# POSITIVO (mutación B: sin Template Method; esqueleto duplicado en 2 unidades).
def mine_csv(path):
    open_file(path)
    extract_csv_data()
    analyze_data()
    send_report()
    close_file()


def mine_log(path):
    open_file(path)
    extract_log_lines()
    analyze_data()
    send_report()
    close_file()
