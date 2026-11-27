# FRIEND CHAT
Projekt na obronę praktyk pt. FRIEND CHAT to platforma internetowa do poznawania i rozmawiania z nowymi osobami.

## OPIS
FRIEND CHAT to platforma internetowa do znajdowania przyjaciół i partnerów do rozmów, skierowana wyłącznie do osób pełnoletnich. Serwis oferuje przestrzeń do komunikacji prywatnej, grupowej oraz wideo. Platforma umożliwia nawiązywanie kontaktów i rozmowy z nieznajomymi na dowolne tematy. Jej głównym celem jest pomoc w przełamywaniu barier społecznych oraz językowych, dzięki możliwości prowadzenia konwersacji z ludźmi z całego świata.

## DZIAŁANIE
### ŁĄCZENIE
1. Wysłanie żądania na serwer
2. Analiza preferencji i informacji
3. Dodanie do kolejki
4. Sprawdzanie kolejki i parowanie
5. Wysłanie informacji i połączenie sesji użytkowników

### KOMUNIKACJA
1. Wysłanie wiadomości do serwera
2. Weryfikacja wiadomości
3. Zapis do bazy danych (jeszcze niezaimplementowany)
4. Przesłanie do użytkownika/-ów
5. Wyświetlenie otrzymanej treści w interfejsie

### ROZMOWA WIDEO
1. Po kliknięciu „New Chat” przeglądarka prosi o dostęp do kamery i mikrofonu.
2. Użytkownik trafia do kolejki wideo, oddzielnej od kolejki czatu tekstowego.
3. Socket.IO przekazuje między sparowanymi użytkownikami ofertę, odpowiedź i kandydatów ICE.
4. WebRTC zestawia połączenie audio/wideo między przeglądarkami; serwer aplikacji nie odbiera ani nie zapisuje mediów rozmowy.

Dostęp do kamery i mikrofonu wymaga bezpiecznego kontekstu (HTTPS lub localhost). Konfiguracja zawiera publiczny serwer STUN, ale nie serwer TURN, więc niektóre sieci mogą uniemożliwić zestawienie połączenia.

### IDENTYFIKATOR POŁĄCZENIA SOCKET.IO
Serwer przechowuje własny identyfikator aplikacyjny w `socket.data.connectionId`:

- zalogowany użytkownik otrzymuje swoje `session.userId`,
- niezalogowany użytkownik otrzymuje identyfikator w formacie `socket_<socket.id>`.

`socket.id` pozostaje transportowym identyfikatorem Socket.IO i nie jest nadpisywany.
Jeśli dla zalogowanego użytkownika pojawi się nowe połączenie, serwer rozłącza
poprzednie i przypisuje użytkownika do nowego. Dzięki temu odświeżenie strony
nie blokuje ponownego połączenia. Poprzedni czat zostaje zakończony, a partner
otrzymuje informację o opuszczeniu rozmowy. Po stronie przeglądarki identyfikator
aplikacyjny jest dostępny jako `socket.connectionId` po zdarzeniu `connectionId`.

Klient Socket.IO domyślnie łączy się z tym samym adresem, z którego otwarto
stronę, zaczynając od pollingu i próbując przejść na WebSocket. Na Windowsie z
XAMPP otwieraj stronę przez `http://localhost` i uruchom backend Node na porcie
3000 (`node node/server.js`); klient połączy się bezpośrednio
z `http://localhost:3000`, omijając proxy Apache dla transportu Socket.IO.
Na serwerze Linux klient używa domeny strony, a Apache przekazuje `/socket.io/`
do Node. Reguła w `.htaccess` wymaga włączonych modułów `mod_rewrite`,
`mod_proxy`, `mod_proxy_http` i `mod_proxy_wstunnel`. Jeśli używasz Nginx,
skonfiguruj proxy dla `/socket.io/` z HTTP/1.1 oraz nagłówkami `Upgrade` i
`Connection`. Backend powinien nasłuchiwać na porcie 3000 albo port Node i
odpowiednie reguły proxy muszą być zgodne. Połączenie z osobną domeną frontendu
wymaga osobnej konfiguracji adresu Socket.IO i CORS.

## WERSJE PROGRAMÓW
- NodeJS: **v26.8.2**
- NPM: **12.0.2**

## PACZKI NPM
- bcryptjs@3.0.3
- dotenv@17.4.2
- ejs@6.0.1
- express-session@1.19.0
- express@5.2.1
- firebase-admin@14.5.0
- nodemailer@10.0.14
- socket.io@4.8.3
