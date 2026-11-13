/* Crowfit: programação de treinos (dados + seleção). Sem DOM, sem armazenamento.
   Para mudar conteúdo: edite SECTIONS, LIB e as escadas (ladders) abaixo. A interface não precisa mudar.
   IMPORTANTE: o progresso do usuário é guardado por ID de exercício (ex.: "s1u4" -> {"ag": true}).
   Se renomear um exercício, mantenha o ID; se trocar o ID, o "concluído" antigo daquele exercício deixa de contar. */
(function (root, f) { if (typeof module === "object" && module.exports) module.exports = f(); else root.CFP = f(); })(typeof self !== "undefined" ? self : this, function () {
"use strict";

/* Títulos das seções (configuráveis). Seções além da lista usam o título padrão. */
var SECTIONS = [{ t: "Primeiros passos" }, { t: "Construindo força" }, { t: "Evolução e resistência" }, { t: "Treinamento avançado" }];
function secTitle(k) { return SECTIONS[k - 1] ? SECTIONS[k - 1].t : "Nova fase " + k; }

var DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
var DIAS_ABR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/* getDay(): 0 = domingo ... 6 = sábado. A semana começa no domingo. Descanso (R) é sempre sábado. */
var BYDOW = ["O", "P", "B", "A", "L", "C", "R"];
var GROUPS = {
  P: { n: "Peito", t: "Treino de peito" }, B: { n: "Braços", t: "Treino de braços" }, A: { n: "Abdômen", t: "Treino de abdômen" },
  L: { n: "Pernas", t: "Treino de pernas" }, C: { n: "Costas", t: "Treino de costas" }, O: { n: "Ombros", t: "Treino de ombros" },
  R: { n: "Recuperação", t: "Dia de recuperação" } };

/* Símbolos planetários (traço, viewBox 48), um por dia da semana:
   Dom O Sol | Seg P Lua | Ter B Marte | Qua A Mercúrio | Qui L Júpiter | Sex C Vênus | Sáb R Saturno (descanso). */
var ICON = {
  O: '<circle cx="24" cy="24" r="10"/><path d="M24 23.6v.8"/>',
  P: '<path d="M31 8a17 17 0 1 0 0 32A13 13 0 0 1 31 8z"/>',
  B: '<circle cx="20" cy="28" r="8"/><path d="M26 22l10-10M29 12h7v7"/>',
  A: '<circle cx="24" cy="19" r="6"/><path d="M24 25v11M18 36h12M17 9c2 3 12 3 14 0"/>',
  L: '<path d="M11 16h18M20 8v32M20 25c3-6 12-7 13-1s-5 9-9 6"/>',
  C: '<circle cx="24" cy="18" r="8"/><path d="M24 26v12M18 33h12"/>',
  R: '<path d="M10 16h16M18 8v27c0 4 3 6 7 5s5-3 5-6"/>' };

/* Biblioteca: id -> [nome, tipo ("r" repetições | "s" segundos), valor base, orientação]. IDs: minúsculas, números e "_" (até 24). */
var LIB = {
marcha:["Marcha acelerada no lugar","s",60,"Eleve bem os joelhos e balance os braços. Respire de forma contínua."],
po:["Polichinelo","s",30,"Aterrisse macio, com os joelhos levemente flexionados."],
corrida_l:["Corrida no lugar","s",40,"Passos rápidos e leves, tronco firme."],
joelho_a:["Joelho alto","s",30,"Suba o joelho até a altura do quadril em ritmo constante."],
bu:["Burpee","r",5,"Agache, leve os pés para trás, volte e salte. Vá no seu ritmo."],
al:["Alongamento final","s",40,"Respire devagar. Alongue os músculos que trabalhou, sem dor."],
/* peito */
fl_inc:["Flexão inclinada (mãos no sofá)","r",10,"Mãos num apoio firme e alto. Corpo reto da cabeça aos calcanhares."],
fl_j:["Flexão com joelhos no chão","r",8,"Corpo reto dos joelhos à cabeça. Desça até o peito quase tocar o chão."],
fl:["Flexão de braço","r",8,"Mãos na largura dos ombros, cotovelos a 45° do corpo."],
fl_dec:["Flexão declinada (pés elevados)","r",6,"Pés num apoio baixo e estável. Abdômen firme."],
fl_arq:["Flexão arqueiro","r",4,"Desça para um lado mantendo o outro braço estendido, alternando."],
fl_lar:["Flexão com mãos afastadas","r",8,"Mãos além da largura dos ombros. Desça com controle."],
fl_pau:["Flexão com pausa embaixo","r",6,"Pare 1 segundo com o peito perto do chão e suba."],
fl_exp:["Flexão explosiva","r",5,"Empurre rápido até as mãos soltarem do chão e aterrisse macio."],
fl_iso:["Flexão isométrica (parada embaixo)","s",10,"Segure a posição baixa da flexão, corpo reto."],
pr_alta:["Prancha alta","s",20,"Mãos sob os ombros, corpo reto, sem afundar o quadril."],
pr_toque:["Prancha com toque no ombro","r",10,"Em prancha alta, toque o ombro oposto sem girar o quadril."],
pr_flx:["Prancha com subida e descida","r",6,"Vá dos antebraços para as mãos e volte, alternando o braço que lidera."],
/* braços */
fl_fec_j:["Flexão fechada com joelhos","r",8,"Mãos próximas sob o peito, cotovelos junto ao corpo."],
fl_fec:["Flexão fechada","r",8,"Mãos próximas sob o peito, cotovelos junto ao corpo."],
fl_dia:["Flexão diamante","r",6,"Mãos juntas formando um diamante. Foco no tríceps."],
fl_dia_dec:["Flexão diamante declinada","r",5,"Pés num apoio baixo e estável. Controle na descida."],
bi_toalha:["Rosca isométrica com toalha","s",20,"Pise na toalha, puxe as pontas para cima com os cotovelos a 90° e segure."],
bi_mochila:["Rosca com mochila","r",10,"Segure a mochila carregada pela alça e dobre os cotovelos devagar."],
bi_mochila_l:["Rosca lenta com mochila","r",8,"Suba em 2 segundos e desça em 3."],
bi_mochila_u:["Rosca unilateral com mochila","r",8,"Um braço por vez; faça as repetições nos dois lados."],
chin_mesa:["Remada supinada sob a mesa","r",6,"Use uma mesa bem firme. Palmas para você e corpo reto; suba o peito até a borda."],
tri_par:["Extensão de tríceps na parede","r",12,"Mãos na parede, desça a testa dobrando os cotovelos e empurre de volta."],
mg:["Mergulho no sofá ou cadeira firme","r",6,"Use um apoio estável. Desça dobrando os cotovelos para trás."],
mg_ret:["Mergulho com pernas esticadas","r",6,"Pernas retas à frente. Desça controlando o movimento."],
mg_1:["Mergulho com uma perna elevada","r",5,"Estenda uma perna e alterne a cada série."],
/* ombros */
pk_par:["Flexão em V na parede","r",10,"Mãos na parede e quadril alto; aproxime a cabeça da parede."],
pk:["Flexão em pike","r",5,"Quadril alto em V invertido. Desça a cabeça em direção ao chão."],
pk_lent:["Flexão em pike lenta","r",5,"Desça em 3 segundos mantendo o quadril alto."],
pk_ele:["Flexão em pike com pés elevados","r",5,"Pés num apoio estável. Quadril alto, cabeça entre os braços."],
pk_ele_l:["Pike elevado com pausa","r",4,"Pare 1 segundo embaixo e suba com controle."],
cir_br:["Círculos de braço","s",30,"Braços estendidos, círculos pequenos e depois maiores."],
elev_lat:["Elevação lateral isométrica","s",20,"Braços abertos na altura dos ombros, sem encolher o pescoço."],
urso_t:["Toque no ombro em posição de urso","r",10,"Joelhos a poucos centímetros do chão; toque o ombro oposto."],
ytw:["Elevações Y-T-W deitado","r",8,"Deitado de bruços, eleve os braços formando Y, T e W."],
ytw_seg:["Y-T-W com pausa","r",8,"Segure 2 segundos no topo de cada posição."],
desl_par:["Deslizamento de braços na parede","r",10,"Costas e braços na parede; deslize para cima e para baixo."],
parada:["Parada de mão com apoio na parede","s",10,"Só avance se se sentir seguro. Use um espaço livre e sem objetos."],
/* costas */
sup:["Superman","r",10,"Deitado de bruços, eleve braços e pernas juntos e desça devagar."],
sup_alt:["Superman alternado","r",10,"Eleve braço e perna opostos, alternando."],
nadad:["Nadador","s",20,"Alterne braços e pernas elevados, pescoço neutro."],
sup_seg:["Superman com pausa","r",8,"Segure 3 segundos no topo."],
rem_mesa:["Remada invertida sob a mesa","r",6,"Mesa muito firme. Corpo reto; puxe o peito até a borda."],
bird:["Cachorro-pássaro","r",10,"Em quatro apoios, estenda braço e perna opostos sem girar o quadril."],
pr_rev_j:["Prancha reversa com joelhos dobrados","s",15,"Mãos atrás do corpo, suba o quadril."],
pr_rev:["Prancha reversa","s",15,"Corpo reto, quadril alto, olhar à frente."],
pr_rev_p:["Prancha reversa com elevação de perna","r",8,"Alterne as pernas sem deixar o quadril cair."],
bomdia:["Bom dia (dobradiça de quadril)","r",12,"Mãos atrás da cabeça e joelhos levemente flexionados; incline o tronco com as costas retas."],
bomdia_l:["Bom dia lento","r",10,"Desça em 3 segundos e suba com controle."],
stiff_u:["Stiff unilateral sem peso","r",8,"Equilíbrio em uma perna, quadril para trás, costas retas."],
stiff_mo:["Stiff unilateral com mochila","r",8,"Mochila leve nas mãos, costas retas."],
esc_ret:["Retração escapular deitado","r",12,"Deitado de bruços, aproxime as escápulas sem elevar os ombros."],
rem_toalha:["Remada com toalha na porta","r",10,"Prenda a toalha numa porta fechada e firme; incline-se para trás e puxe."],
/* abdômen */
ab_cur:["Abdominal curto","r",12,"Eleve só as escápulas, sem puxar o pescoço."],
ab:["Abdominal tradicional","r",10,"Mãos cruzadas no peito. Suba a escápula, sem puxar o pescoço."],
ab_cruz:["Abdominal cruzado","r",12,"Leve o cotovelo em direção ao joelho oposto."],
ab_v:["Abdominal canivete (V-up)","r",8,"Eleve tronco e pernas ao mesmo tempo, com controle."],
ab_hol:["Hollow hold","s",15,"Lombar colada ao chão, pernas e ombros elevados."],
pr_j:["Prancha com joelhos","s",20,"Joelhos apoiados, corpo reto dos joelhos à cabeça."],
pr:["Prancha","s",20,"Cotovelos sob os ombros, abdômen firme, sem afundar o quadril."],
pr_c:["Prancha com elevação alternada de perna","r",10,"Eleve uma perna de cada vez sem girar o quadril."],
pr_ant:["Prancha com braços à frente","s",15,"Braços um pouco à frente dos ombros; abdômen firme."],
pe_j:["Elevação de joelhos deitado","r",10,"Lombar apoiada, leve os joelhos ao peito."],
pe:["Elevação de pernas","r",8,"Deitado, pernas retas. Desça sem encostar os pés no chão."],
bi:["Abdominal bicicleta","r",12,"Cotovelo oposto ao joelho, movimento controlado."],
tes:["Tesoura","r",12,"Pernas alternando acima do chão, lombar apoiada."],
pr_lat_j:["Prancha lateral com joelho apoiado","s",15,"Faça dos dois lados, quadril alto."],
pr_lat:["Prancha lateral","s",20,"Faça dos dois lados, corpo em linha reta."],
pr_lat_el:["Prancha lateral com elevação de quadril","r",8,"Desça e suba o quadril com controle; faça dos dois lados."],
mc:["Escalador (mountain climber)","s",20,"Posição de flexão, traga os joelhos ao peito em ritmo constante."],
/* pernas */
ag_ap:["Agachamento com apoio na cadeira","r",10,"Sente na cadeira e levante sem impulso das mãos."],
ag:["Agachamento livre","r",12,"Pés na largura dos ombros, peito aberto, joelhos alinhados com os pés."],
ag_pau:["Agachamento com pausa","r",10,"Pare 2 segundos embaixo e suba com firmeza."],
ag_bul:["Agachamento búlgaro","r",8,"Pé de trás apoiado numa cadeira firme; faça nos dois lados."],
ag_pist:["Agachamento em uma perna com apoio","r",5,"Segure em algo firme e desça devagar; faça nos dois lados."],
af_est:["Afundo estático","r",8,"Passo longo, desça e suba sem tirar os pés do lugar."],
af:["Afundo alternado","r",10,"Passo longo à frente. O joelho de trás quase toca o chão."],
af_rev:["Afundo reverso","r",10,"Passo para trás e desça com o tronco ereto."],
af_cam:["Afundo caminhando","r",12,"Avance a cada repetição, com passos controlados."],
af_salto:["Afundo com salto","r",8,"Troque as pernas no ar e aterrisse macio."],
pg:["Ponte de glúteos","r",12,"Deitado, pés no chão. Suba o quadril e aperte o glúteo no topo."],
pg_pau:["Ponte com pausa","r",10,"Segure 2 segundos no topo."],
pg_u:["Ponte unilateral","r",8,"Uma perna estendida; faça nos dois lados."],
pg_el:["Ponte unilateral com pé elevado","r",8,"Apoie o pé num degrau baixo e firme; faça nos dois lados."],
pa:["Elevação de panturrilha","r",15,"Suba nas pontas dos pés, devagar, e segure 1 segundo."],
ag_s:["Agachamento isométrico na parede","s",20,"Costas na parede, coxas paralelas ao chão. Respire fundo."],
pa_u:["Elevação de panturrilha unilateral","r",10,"Apoie-se levemente na parede; faça nos dois lados."],
ag_salto:["Agachamento com salto","r",8,"Salte e aterrisse macio, com os joelhos alinhados."],
/* recuperação */
cam_lev:["Caminhada leve","s",600,"Ritmo confortável, que permita conversar."],
mob_quad:["Mobilidade de quadril","s",60,"Círculos lentos com o joelho; respire com calma."],
gato_vaca:["Gato-vaca","r",10,"Em quatro apoios, arredonde e estenda a coluna devagar."],
cri:["Postura da criança","s",45,"Quadril para trás, testa no chão, respire profundo."],
resp:["Respiração diafragmática","s",60,"Inspire pelo nariz expandindo a barriga; solte o ar devagar."]
};

/* Escadas de dificuldade: cada posição é um degrau; "a|b" alterna variações semana a semana. */
var CARD = ["marcha", "po", "corrida_l", "joelho_a", "bu"], AL = ["al"];
var PLAN = {
  P: [CARD, ["fl_inc","fl_j","fl","fl_dec","fl_arq"], ["fl_inc|fl_j","fl_j|fl_lar","fl_lar|fl_pau","fl_pau|fl_dec","fl_dec|fl_exp"], ["pr_alta","pr_alta|pr_toque","pr_toque","pr_toque|pr_flx","pr_flx"], ["fl_iso","fl_iso|fl_lar","fl_lar","fl_pau","fl_exp|fl_arq"], AL],
  B: [CARD, ["fl_fec_j","fl_fec","fl_dia","fl_dia|fl_dia_dec","fl_dia_dec"], ["bi_toalha","bi_mochila","bi_mochila_l","bi_mochila_u","chin_mesa"], ["pr_alta","pr_toque","pr_toque|pr_flx","pr_flx","pr_flx"], ["tri_par","mg","mg|mg_ret","mg_ret","mg_ret|mg_1"], AL],
  A: [CARD, ["ab_cur","ab","ab_cruz","ab_v","ab_v|ab_hol"], ["pr_j","pr","pr_c","pr_c|pr_toque","pr_ant"], ["pe_j","pe","pe|bi","bi","bi|tes"], ["pr_lat_j","pr_lat","pr_lat","pr_lat|mc","mc|pr_lat_el"], AL],
  L: [CARD, ["ag_ap","ag","ag_pau","ag_bul","ag_pist"], ["af_est","af","af_rev","af_cam","af_salto"], ["pg","pg_pau","pg_u","pg_u|pg_el","pg_el"], ["pa","ag_s","pa_u","ag_salto","ag_salto|pa_u"], AL],
  C: [CARD, ["sup","sup_alt","nadad","sup_seg","rem_mesa"], ["bird","bird|pr_rev_j","pr_rev_j","pr_rev","pr_rev|pr_rev_p"], ["bomdia","bomdia_l","stiff_u","stiff_u|sup_seg","stiff_mo"], ["esc_ret","esc_ret|rem_toalha","rem_toalha","rem_toalha|rem_mesa","rem_mesa"], AL],
  O: [CARD, ["pk_par","pk","pk_lent","pk_ele","pk_ele_l"], ["cir_br","elev_lat","elev_lat|pr_toque","pr_toque","urso_t"], ["ytw","ytw|desl_par","ytw_seg","ytw_seg|desl_par","parada"], ["pr_alta","pr_toque","urso_t","pr_flx","parada"], AL],
  R: [["cam_lev"], ["mob_quad"], ["gato_vaca"], ["cri"], ["resp"], AL]
};
var ONE_SET = { marcha: 1, po: 1, corrida_l: 1, joelho_a: 1, al: 1 };

function mk(id, w, sec, lv, g) {
  var e = LIB[id], kind = e[1], base = e[2], val, sets;
  if (g === "R") { val = base <= 120 ? base + 5 * Math.min(sec - 1, 6) : base; sets = kind === "r" ? 2 : 1; }
  else {
    var v = base * (1 + 0.03 * Math.min(w, 12));  /* rampa gradual dentro da seção; reinicia ao subir de seção (degrau novo) */
    val = kind === "s" ? Math.max(5, Math.round(v / 5) * 5) : Math.round(v);
    sets = ONE_SET[id] ? 1 : (id === "bu" ? 2 : ((lv === 0 && sec === 1 && w < 4) ? 2 : 3));
  }
  var unit = kind === "r" ? " repetições" : (val >= 120 ? "" : " segundos");
  var amount = kind === "s" && val >= 120 ? Math.round(val / 60) + " minutos" : val + unit;
  return { id: id, name: e[0], kind: kind, val: val, sets: sets, tip: e[3], label: sets > 1 ? sets + " séries de " + amount : amount };
}

/* Monta o treino de uma unidade. sec: nº da seção; n: nº da unidade na seção; dow: dia da semana (0 = domingo);
   lv: nível base (0..2) congelado para a seção. O degrau da escada = lv + (seção - 1): quem começa mais forte começa mais alto,
   e cada seção nova sobe um degrau. Dentro da seção, volume sobe devagar (rampa) e as variações alternam por semana. */
function build(sec, n, dow, lv) {
  var g = BYDOW[((dow % 7) + 7) % 7], w = Math.floor((n - 1) / 7), tier0 = lv + (sec - 1), used = {}, out = [];
  PLAN[g].forEach(function (ladder, slot) {
    var id = null;
    for (var t = Math.min(ladder.length - 1, tier0); t >= 0 && !id; t--) {
      var parts = ladder[t].split("|");
      for (var j = 0; j < parts.length; j++) { var c = parts[(w + slot + j) % parts.length]; if (!used[c]) { id = c; break; } }
    }
    if (id && LIB[id]) { used[id] = 1; out.push(mk(id, w, sec, lv, g)); }
  });
  return { group: g, title: GROUPS[g].t, name: GROUPS[g].n, exercises: out };
}

return { SECTIONS: SECTIONS, secTitle: secTitle, DIAS: DIAS, DIAS_ABR: DIAS_ABR, GROUPS: GROUPS, ICON: ICON, LIB: LIB, PLAN: PLAN, build: build };
});
