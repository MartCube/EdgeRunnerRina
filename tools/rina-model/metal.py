import json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
import sys
S=sys.argv[1].rstrip('/')+'/'
N=2048
tris=json.load(open(S+'armtris.json'))
def draw(sel):
    m=Image.new('L',(N,N),0); d=ImageDraw.Draw(m)
    for t in tris:
        if sel(t): d.polygon([(t[0]*N,t[1]*N),(t[2]*N,t[3]*N),(t[4]*N,t[5]*N)],fill=255)
    return np.array(m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))).astype(float)/255
mask=draw(lambda t:t[6]==1)
kmask=draw(lambda t:t[6]==0)
base=np.array(Image.open(S+'tex/0_0.jpg').convert('RGB')).astype(float)/255
mr=np.array(Image.open(S+'tex/ess.png').convert('RGB')).astype(float)/255
r,g,b=base[...,0],base[...,1],base[...,2]
mx=base.max(-1); mn=base.min(-1); sat=(mx-mn)/np.maximum(mx,1e-4); val=mx
hue=np.zeros_like(mx); dl=np.maximum(mx-mn,1e-4)
hue=np.where(mx==r,((g-b)/dl)%6,np.where(mx==g,(b-r)/dl+2,(r-g)/dl+4))*60
lum=base@np.array([0.2126,0.7152,0.0722])
skin=(hue>10)&(hue<38)&(sat>0.25)&(sat<0.75)&(val>0.45)
gold=(hue>=38)&(hue<70)&(sat>0.35)
pink=((hue>300)|(hue<10))&(sat>0.35)
grey=(sat<0.25)|((sat<0.4)&(val>0.6)&~skin)
metal=np.zeros_like(mx); rough=mr[...,1].copy(); newbase=base.copy()
# chrome on the white/grey plates
chrome=grey&~skin
metal[chrome]=1.0; rough[chrome]=np.clip(0.12+0.25*(1-lum[chrome]),0.12,0.4)
tint=np.array([0.80,0.83,0.90])
newbase[chrome]=(0.35+0.65*lum[chrome])[:,None]*tint
metal[gold]=1.0; rough[gold]=0.25
newbase[gold]=np.clip(base[gold]*np.array([1.05,0.92,0.6]),0,1)
metal[pink]=0.55; rough[pink]=0.3
keep=skin|~(chrome|gold|pink)
k=mask*(~keep)
light=(val>0.55)&(chrome|gold)
k=np.maximum(k,kmask*light)
outmr=mr.copy()
outmr[...,1]=mr[...,1]*(1-k)+rough*k
outmr[...,2]=mr[...,2]*(1-k)+metal*k
outbase=base*(1-k[...,None])+newbase*k[...,None]
Image.fromarray((outmr*255+0.5).astype(np.uint8)).save(S+'mr_new.png')
Image.fromarray((outbase*255+0.5).astype(np.uint8)).save(S+'base_new.png')
print('changed px', (k>0.5).mean())
