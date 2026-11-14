import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

suspend fun work(scope: CoroutineScope) {
  scope.async { 1 } // flag
  async { 2 } // flag
  val kept = scope.async { 3 }
  scope.launch { 4 }
  println(kept.await())
}
