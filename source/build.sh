#!/bin/bash
cd "$(dirname "$0")"
python3 - <<'PYEOF'
style = open('app_style.html', encoding='utf-8').read()
style = style.replace('<title>Курс ОСМС — обучение медперсонала по НПА РК</title>\n', '')
style = style.replace('</style>', open('app_style2.css', encoding='utf-8').read() + '\n</style>')
body = open('app_body2.html', encoding='utf-8').read()
js_files = ['content_acts.js','content_g1.js','content_g2.js','content_g3.js',
            'content_vax.js','content_checkup.js','taxonomy.js',
            'app_core.js','app_views.js','app_print.js','app_search.js','app_exam.js','app_bind.js']
js = "\n".join(open(f, encoding='utf-8').read() for f in js_files)
html = style + "\n" + body + "\n<script>\n" + js + "\n</" + "script>\n"
open('lms.html','w',encoding='utf-8').write(html)
full = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<meta name="description" content="Обучение медперсонала по нормативным правовым актам РК: курсы по направлениям деятельности медорганизации, тесты, поиск по нормам.">\n'
        '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ctext y=\'.9em\' font-size=\'90\'%3E%E2%9A%96%EF%B8%8F%3C/text%3E%3C/svg%3E">\n'
        '<style>html{color-scheme:light dark}</style>\n' + html + '\n</body>\n</html>\n')
open('index2.html','w',encoding='utf-8').write(full)
open('test2.html','w',encoding='utf-8').write(full)
print('собрано:', round(len(html.encode())/1024), 'КБ')
PYEOF
