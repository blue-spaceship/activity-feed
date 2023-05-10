
# Activity feed 

Configurar as seguintes variáveis ambiente
```
REDIS_URL=redis://127.0.0.1:6379
REDIS_PASSWORD=
REDIS_DATABASE=command-tower
```

## Primeiros passos
``` javascript 
import { Feed, Activity } from '@blue-spaceship/rocket-feed';

/**
 * Start Mongo connection
 **/

// Creating feeds
const user1 = await Feed.createFeed( 'user1', 'User' );
const user2 = await Feed.createFeed( 'user2', 'User' );

// User:user1 is following/unfollowing User:user2
// When someone follow or unfollow anyone is auto created an activity for this action
Feed.follow( 'user2', 'User', 'user1', 'User' );
Feed.unfollow( 'user2', 'User', 'user1', 'User' );

// Posting an activity
const act_creatingSomething = new Activity({
	actor: 'user1',
	actorMode: 'User',
	verb: 'enter',
	target: 'roomA',
	targetModel: 'Room',
	source: 'house',
	sourceModel: 'Place'
})

act_creatingSomething.post('user1', {
	replication: true, // ever follower will receive this post
	extra: ['root'] // will copy this post on feed id 'root'
})

// Get Feed of activities for 'root' ID
Feed.getFeed( 'root', { activities = true } )
```


## Activity Model
| propriedade | tipo | descrição | obrigatório |
|--|--|--|--|
| actor | String | Index que identifique o ator da atividade | sim |
| actorModel | String | Model que identifica o tipo do ator | sim |
| verb | String | Verbo da ação realizada | sim |
| timestamp | Date | Timestamp de quando a ação foi registrada | sim |
| target | String | Index que identifique o alvo da atividade | não |
| targetModel | String | Model que identifica o tipo do alvo | não |
| source | String | Index que identifique a origem do algo da atividade | não |
| sourceModel | String | Model que identifica o tipo da origem | não |
| extra | Object | conteúdo extra da atividade, pode ser de qualquer tipo como um objeto serializado ou um JSON | não

## Feed Model
|  propriedade | tipo | descrição | obrigatório |
|--|--|--|--|
| **_id** | String | id do feed, de preferencia um identificador padronizado | sim |
| group | String | tipo de feed | sim |
| baseModel | String | Model que identifica o Model base do identificador | sim |

### Virtual fields
|  propriedade | tipo | descrição | obrigatório |
|--|--|--|--|
| activities | [ *ActivityFeed* ] | Lista de atividades vinculadas ao feed | - |
| followers | [ *Feed* ] | Lista de feeds que seguem o feed | - |

## Activity Feed Model
|  propriedade | tipo | descrição | obrigatório |
|--|--|--|--|
| feed | String | Id do feed em que a atividade está mostrada | sim |
| activity| *Activity* | Objeto da atividade vinculada ao feed. A mesma atividade pode aparecer em n feeds. | sim |
| source | String | Id do feed de origem da atividade, quando igual ao feed, significa que está no lugar de origem | sim |

## Follow Model
|  propriedade | tipo | descrição | obrigatório |
|--|--|--|--|
| **target** | String | Id do feed seguidor | sim |
| **source** | String | Id do feed seguido | sim |
