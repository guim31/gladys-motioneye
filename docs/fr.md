# motionEye

Amène dans Gladys les caméras d'un serveur [motionEye](https://github.com/motioneye-project/motioneye)
(motionEye sur un Raspberry Pi, un NAS ou dans Docker, motionEyeOS) : leur image, le mouvement
qu'elles voient en ce moment, et les interrupteurs de motionEye pour la détection de mouvement, la
prise de photos et l'enregistrement vidéo. Un mouvement déclenche une scène avec une image fraîche,
pour qu'une scène puisse vous l'envoyer.

Testée contre de vrais serveurs motionEye dans Docker (0.42 et 0.45 en développement) avec une
caméra réseau simulée, pas encore sur un Raspberry Pi sous motionEyeOS : vos retours sont les
bienvenus sur [GitHub](https://github.com/guim31/gladys-motioneye/issues) ou sur le forum Gladys.

## Ce qu'il faut

- Gladys 5.1 ou plus récent.
- Un serveur motionEye joignable depuis Gladys sur le réseau local, en version 0.42 ou plus
  récente. Sa page web est en général à `http://<adresse>:8765`.
- Le compte **administrateur** de motionEye (utilisateur `admin` par défaut, celui qui ouvre les
  réglages). L'utilisateur de surveillance ne voit que les images : il ne peut changer aucun
  interrupteur.
- Un serveur motionEye par intégration. Les caméras d'autres serveurs motionEye peuvent être
  ajoutées à celui-ci comme « caméra motionEye distante », et arrivent alors dans Gladys avec lui.

## Mise en place

1. Dans Gladys, ouvrez **Intégrations**, trouvez **motionEye** et installez-la.
2. Dans son onglet **Configuration**, renseignez :
   - **Adresse de motionEye** : l'adresse de la page motionEye, ex. `192.168.1.20:8765`. Le port
     8765 est pris si aucun n'est indiqué ; écrivez `https://` ou un chemin
     (`http://nas.lan:80/motioneye`) derrière un proxy inverse.
   - **Nom d'utilisateur administrateur** (`admin` par défaut) et **Mot de passe**.
   - **Vérification du mouvement** : fréquence de lecture de chaque caméra ajoutée dans Gladys (2,
     5, 10 ou 30 secondes, 5 par défaut). C'est le délai avant de voir un mouvement.
   - **Rafraîchissement des images** : fréquence d'envoi de chaque image à Gladys (de 10 secondes
     à 15 minutes, 1 minute par défaut). Un mouvement en envoie aussi une aussitôt.
   - **Langue des noms** : la langue des noms de fonctionnalités (français par défaut), donnés à
     l'ajout d'une caméra.
3. Enregistrez, puis ouvrez l'onglet **Découverte** : un appareil par caméra motionEye. Ajoutez
   celles que vous voulez.
4. Le bouton **Vérifier la connexion** de l'onglet Configuration liste les caméras de motionEye,
   si elles répondent et si leur détection de mouvement est activée.

## Les appareils Gladys

Chaque caméra motionEye devient une caméra Gladys nommée comme dans motionEye, avec :

| Fonctionnalité         | Ce que c'est                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Image                  | L'image de la caméra, pour la boîte caméra du tableau de bord et l'action de scène « Envoyer une image de caméra ».                    |
| Mouvement              | Le mouvement vu en ce moment par motionEye (détecté / rien), quand la détection de mouvement est activée.                              |
| Détection de mouvement | Interrupteur : la détection de mouvement de la caméra dans motionEye.                                                                  |
| Prise de photos        | Interrupteur : les photos de la caméra dans motionEye (prises selon le mode choisi dans motionEye : sur mouvement, à intervalles…).    |
| Enregistrement vidéo   | Interrupteur : les vidéos de la caméra dans motionEye (enregistrées selon le mode choisi dans motionEye : sur mouvement, en continu…). |

Les interrupteurs suivent la page motionEye : un changement fait là-bas arrive dans Gladys en moins
d'une minute. Une caméra qui ne répond plus apparaît injoignable sur sa carte d'appareil.

**Changer un interrupteur redémarre les caméras de motionEye quelques secondes** (motionEye
redémarre son processus `motion` à chaque changement de réglages) : les images s'interrompent
pendant ce temps.

## Widget du tableau de bord

**Caméra motionEye** (réglage du widget : la caméra) montre l'image avec son heure, si un mouvement
est vu, si la détection de mouvement et l'enregistrement vidéo sont activés, et deux boutons : l'un
active ou désactive la détection de mouvement, l'autre fait enregistrer une photo par motionEye et
ramène la nouvelle vue.

## Scènes

### Déclencheurs

- **motionEye : mouvement détecté** : une caméra commence à voir un mouvement (détection activée
  dans motionEye). Choisissez une caméra, ou laissez vide pour toutes. Son image est envoyée
  aussitôt à Gladys : une action « Envoyer une image de caméra » juste après envoie le moment de
  la détection. Le nom de la caméra est transmis aux actions.
- **motionEye : caméra hors ligne** : une caméra ne répond plus (motionEye n'en reçoit plus
  d'image, ou motionEye lui-même est arrêté), après trois lectures ratées de suite. Même choix de
  caméra.

### Actions

- **motionEye : détection de mouvement** : active ou désactive la détection de mouvement, pour une
  caméra, ou pour toutes à la fois si la caméra est laissée vide (un seul redémarrage de
  motionEye). Renvoie le nombre de caméras modifiées.
- **motionEye : prendre une photo** : motionEye enregistre une photo avec ses médias, et Gladys
  reçoit la nouvelle image (pour « Envoyer une image de caméra »).
- **motionEye : lire une caméra** : lit une caméra maintenant. Renvoie si elle répond (en ligne),
  voit un mouvement, et si la détection de mouvement, la prise de photos et l'enregistrement vidéo
  sont activés, pour une condition des étapes suivantes.

### Idées de scènes

- **Alarme armée** : quand l'alarme de la maison est armée, « motionEye : détection de
  mouvement » Activée, pour toutes les caméras ; Désactivée quand elle est désarmée.
- **Mouvement à l'entrée** : déclencheur « motionEye : mouvement détecté » sur la caméra de
  l'entrée, puis « Envoyer une image de caméra » de cette caméra sur votre téléphone.
- **Caméra perdue** : déclencheur « motionEye : caméra hors ligne », puis un message « {nom de la
  caméra} ne répond plus ».

## Dépannage

- **« motionEye refuse l'identifiant ou le mot de passe »** : saisissez le compte administrateur
  (celui qui ouvre les réglages de motionEye), pas l'utilisateur de surveillance.
- **« motionEye ne répond pas à cette adresse »** : ouvrez l'adresse dans un navigateur depuis le
  réseau de Gladys ; vérifiez le port (8765 par défaut) et que motionEye écoute sur le réseau, pas
  seulement sur `localhost`.
- **Une caméra est injoignable** : motionEye n'en a pas d'image non plus ; vérifiez-la dans la
  page motionEye.
- **« Mouvement » ne bouge jamais** : la détection doit être activée (interrupteur **Détection de
  mouvement**), et motionEye doit détecter le mouvement lui-même (seuil, masque… dans ses
  réglages).
- **Logs** : l'intégration ne journalise que sa vie (démarrage, serveur ou caméra perdus et
  retrouvés, actions) ; mettez `LOG_LEVEL=debug` sur l'intégration pour voir chaque lecture.

## Limites

- Le mouvement est lu toutes les quelques secondes (réglage **Vérification du mouvement**) : un
  mouvement plus court, et plus court que l'événement motionEye, peut être manqué. motionEye ne
  peut pas prévenir Gladys directement : ses webhooks demanderaient un port de l'intégration
  ouvert sur le réseau.
- Un serveur motionEye par intégration (les autres en caméras distantes, voir plus haut).
- Les caméras « MJPEG simple » de motionEye sont ignorées : motionEye ne fait que relayer leur
  flux, sans détection ni réglages.
- L'image de Gladys n'est pas un flux vidéo : elle se rafraîchit au rythme choisi, et aussitôt sur
  un mouvement.
- Les photos et vidéos restent dans motionEye ; Gladys ne montre que la dernière image.
