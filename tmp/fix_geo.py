with open('/src/components/AbsensiHarianNmsa.tsx', 'r') as f:
    text = f.read()

# 1. Remove the accidentally inserted block in the geo distance section
start_geo = '                    {/* FLOATING ACTION MENU DI PALING ATAS (Z-INDEX TERTINGGI, DI LUAR CONTAINER SCROLL SEHINGGA TIDAK TERPOTONG) */}\n'
end_geo = '                    )}\n                  </div>\n                )}\n\n                <div className="space-y-3">\n'

s_idx = text.find(start_geo)
if s_idx != -1:
    e_idx = text.find(end_geo, s_idx)
    if e_idx != -1:
        # We keep '                  </div>\n                )}\n\n                <div className="space-y-3">\n'
        keep_suffix = '                  </div>\n                )}\n\n                <div className="space-y-3">\n'
        text = text[:s_idx] + keep_suffix + text[e_idx + len(end_geo):]
        print('Removed accidental block from geo distance section')

with open('/src/components/AbsensiHarianNmsa.tsx', 'w') as f:
    f.write(text)
print('Done removing accidental block')
