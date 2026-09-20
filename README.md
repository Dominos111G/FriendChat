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
3. Zapis do bazy danych
4. Przesłanie do użytkownika/-ów
5. Wygenerowanie otrzymanej treści jako HTML

### IDENTYFIKATOR POŁĄCZENIA SOCKET.IO
Serwer przechowuje własny identyfikator aplikacyjny w `socket.data.connectionId`:

- zalogowany użytkownik otrzymuje swoje `session.userId`,
- niezalogowany użytkownik otrzymuje identyfikator w formacie `socket_<socket.id>`.

`socket.id` pozostaje transportowym identyfikatorem Socket.IO i nie jest nadpisywany.
Drugie połączenie zalogowanego użytkownika jest odrzucane błędem
`USER_ALREADY_CONNECTED`. Po stronie przeglądarki identyfikator aplikacyjny jest
dostępny jako `socket.connectionId` po zdarzeniu `connectionId`.

## WERSJE PROGRAMÓW
- NodeJS: **v26.8.2**
- NPM: **12.0.2**

## PACZKI NPM
- bcryptjs@3.0.3
- dotenv@17.4.2
- ejs@6.0.1
- express-session@1.19.0
- express@5.2.1
- firebase-admin@14.4.0
- socket.io@4.8.3
