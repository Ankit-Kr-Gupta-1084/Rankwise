import csv
jan_cols=["21S1","21S2","22S1","22S2","23S1","23S2","24S1","24S2","28S1","28S2"]
jan={
99.9:[227,234,224,223,221,228,219,231,228,226],
99.8:[210,220,207,203,204,209,204,213,209,209],
99.7:[201,209,196,191,194,199,194,200,198,196],
99.6:[192,200,187,182,186,191,187,190,188,189],
99.5:[188,193,180,176,180,184,180,183,181,182],
99.4:[181,187,174,170,174,179,175,177,177,177],
99.3:[177,182,169,166,169,175,171,172,172,173],
99.2:[174,178,165,162,165,171,168,168,168,169],
99.1:[171,174,161,158,161,167,165,164,165,165],
99:[167,171,158,155,158,163,162,160,161,162],
98.5:[154,157,144,143,145,150,150,146,149,150],
98:[144,147,134,131,135,139,141,137,138,140],
97.5:[137,139,126,126,127,132,134,128,132,133],
97:[130,132,120,120,121,126,127,121,126,126],
96.5:[124,127,115,115,116,120,123,115,121,123],
96:[120,122,110,111,111,115,118,110,114,116],
95.5:[115,117,106,107,107,111,113,104,112,112],
95:[110,113,101,104,103,106,109,101,109,108],
94:[105,106,93,97,96,100,102,93,102,103],
93:[99,100,88,92,89,94,96,88,96,95],
92:[94,93,84,88,86,88,92,81,91,91],
91:[90,89,79,84,81,83,86,77,86,86],
90:[85,84,74,81,77,79,80,73,82,85]}
apr_cols=["02M","02E","04M","04E","05M","05E","06M","06E","08E"]
apr={
99.9:[242,244,240,246,258,247,236,255,225],
99.8:[227,224,225,232,241,233,220,243,210],
99.7:[209,212,215,223,231,223,210,232,197],
99.6:[208,203,209,216,224,214,199,225,190],
99.5:[202,189,203,210,218,208,193,219,185],
99.4:[196,189,198,204,210,202,188,213,180],
99.3:[191,184,195,200,206,198,184,208,174],
99.2:[188,180,191,196,202,194,181,198,172],
99.1:[185,176,187,192,197,191,176,198,168],
99:[181,174,184,189,194,188,173,195,165],
98.5:[171,160,174,176,180,175,159,182,154],
98:[161,150,165,165,170,166,150,171,145],
97.5:[155,141,159,160,162,158,141,164,138],
97:[149,135,153,154,154,152,136,158,133],
96.5:[144,129,149,148,147,146,129,152,127],
96:[139,124,145,143,143,143,124,147,124],
95.5:[135,119,140,139,137,137,120,142,119],
95:[131,114,137,135,134,133,116,138,116],
94:[124,107,131,128,126,124,109,131,109],
93:[116,101,125,122,119,119,103,125,103],
92:[113,96,119,116,113,113,98,118,99],
91:[108,93,114,111,107,108,91,113,95],
90:[104,85,109,107,102,102,86,108,91]}
# cells the screenshots show as partly hidden
obscured={("jan",90,"28S1"),("jan",90,"24S2"),("apr",96.5,"02M"),("apr",96,"02M")}
# cells that look inconsistent with neighbouring rows in the source itself (kept as shown)
suspect={("apr",99.5,"02E"),("apr",99.6,"02M"),("apr",99.2,"06E")}
def write(p,h,r):
    with open(p,"w",newline="") as f: w=csv.writer(f); w.writerow(h); w.writerows(r)
H=["year","session","shift_id","exam_date","shift","percentile","marks","record_type","read_quality"]
def shifts(key,sess,cols,tab,datef,mc):
    rows=[]
    for i,c in enumerate(cols):
        for p,v in tab.items():
            q="source_suspect" if (key,p,c) in suspect else "partially_obscured" if (key,p,c) in obscured else "clear"
            rows.append([2026,sess,c,datef(c),"morning" if c[2:]==mc else "evening",p,v[i],"observed",q])
    return rows
jr=shifts("jan","january",jan_cols,jan,lambda c:f"2026-01-{c[:2]}","S1")
ar=shifts("apr","april",apr_cols,apr,lambda c:f"2026-04-{c[:2]}","M")
write("data/2026/january_shiftwise.csv",H,jr); write("data/2026/april_shiftwise.csv",H,ar)
pr=[(99.9923,67,99.99,"clear"),(99.99,98,99.99,"clear"),(99.8997,1640,99.9,"clear"),(99.8,3421,99.8,"clear"),(99.7,4803,99.7,"clear"),
(99.6,6467,99.6,"clear"),(99.5,7962,99.5,"clear"),(99.3972,9622,99.4,"clear"),(99.2999,11261,99.3,"clear"),(99.2,12733,99.2,"clear"),
(99.1023,14393,99.1,"partially_obscured"),(98.9995,16037,99,"clear"),(98.5,22869,98.5,"clear"),(98,30000,98,"rounded_in_source"),
(97.5,39537,97.5,"clear"),(97,42323,97,"source_suspect"),(96.4985,55109,96.5,"clear"),(96,61791,96,"clear"),(95.5,70405,95.5,"clear"),
(95,78403,95,"clear"),(94.5,89000,94.5,"rounded_in_source"),(93.9996,93830,94,"clear"),(93.4123549,102697,93.4,"source_suspect")]
write("data/2026/percentile_rank.csv",["year","scope","percentile_exact","crl_rank","percentile_band","implied_candidates","record_type","read_quality"],
 [[2026,"overall",p,r,b,round(r/(100-p)*100),"observed",q] for p,r,b,q in pr])
def summ(s,cols,t):
    vals=[x for v in t.values() for x in v]
    return [2026,s,len(cols),min(t),max(t),min(vals),max(vals),"","needs_source"]
write("data/2026/session_summary.csv",["year","session","shifts_observed","min_percentile_observed","max_percentile_observed","min_marks_observed","max_marks_observed","candidates_appeared","candidate_count_status"],
 [summ("january",jan_cols,jan),summ("april",apr_cols,apr)])
bad=0
for nm,t,cols in(("jan",jan,jan_cols),("apr",apr,apr_cols)):
    ps=sorted(t,reverse=True)
    for i,c in enumerate(cols):
        for a,b in zip(ps,ps[1:]):
            if t[a][i]<t[b][i]: print("BAD",nm,c,a,b); bad+=1
            if t[a][i]==t[b][i] and a>=99: print("flat",nm,c,a,b,t[a][i])
rk=[r for _,r,_,_ in pr]; assert rk==sorted(rk)
print("issues",bad,len(jr),len(ar))
