<template>
  <section class="cash">
    <!-- Periodo actual: lo cobrado, los gastos y el arqueo. En pantallas anchas apaisadas, a la
         izquierda; los cierres anteriores, en una columna a la derecha. -->
    <div class="cash-current">
    <p v-if="summaryError" class="muted error" role="alert">{{ summaryError }}</p>

    <!-- Apertura: el fondo inicial se anota al empezar el dia y queda guardado para el cierre -->
    <form v-if="summary" class="card opening" @submit.prevent="saveFloat">
      <h2 class="card-title">Apertura de caja</h2>
      <CashPreviousDays
        v-if="showPreviousDays"
        :key="summary.previousDays!.periodStart"
        :pending="summary.previousDays!"
        :last-counted-cents="lastClosing?.countedCashCents ?? null"
        :today-cash-cents="todayCashCents"
        :format="formatPrice"
        @closed="onPreviousDaysClosed"
        @dismiss="previousDaysDismissed = summary.previousDays!.periodStart"
      />
      <template v-if="showPreviousDays" />
      <template v-else-if="summary.openingFloatCents != null && !editingFloat">
        <p class="opening-saved">
          <span>Fondo inicial <strong>{{ formatPrice(summary.openingFloatCents) }}</strong></span>
          <button type="button" class="link-button" @click="startEditFloat">Cambiar</button>
        </p>
        <p class="muted period">
          Anotado por {{ summary.openingFloatStaffName }}<template v-if="summary.openingFloatAt">, {{ formatDateTime(summary.openingFloatAt) }}</template>
        </p>
      </template>
      <template v-else>
        <label class="field">
          <span class="muted">Fondo inicial (cambio con el que se abre la caja)</span>
          <input v-model.number="openingFloat" type="number" min="0" step="50" inputmode="numeric" required />
        </label>
        <p v-if="floatError" class="muted error" role="alert">{{ floatError }}</p>
        <div class="form-actions">
          <button v-if="editingFloat" class="button secondary" type="button" :disabled="savingFloat" @click="editingFloat = false">Cancelar</button>
          <button class="button" type="submit" :disabled="!floatValid || savingFloat">
            {{ savingFloat ? "Guardando…" : "Guardar fondo" }}
          </button>
        </div>
      </template>
    </form>

    <!-- Lo cobrado desde el ultimo cierre -->
    <div v-if="summary" class="card">
      <!-- Navegar: por cierres (el periodo en curso y los anteriores) o dia a dia -->
      <div class="browse">
        <button type="button" class="browse-arrow" :disabled="!canOlder || browseLoading" aria-label="Anterior" @click="older">
          <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
        <SegmentedControl v-model="browseMode" :options="BROWSE_MODES" aria-label="Navegar por" />
        <button type="button" class="browse-arrow" :disabled="!canNewer || browseLoading" aria-label="Siguiente" @click="newer">
          <ChevronRight :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <h2 class="card-title">{{ shownTitle }}</h2>
      <p v-if="shown" class="muted period">
        <template v-if="shownRange">{{ shownRange }} · </template>{{ shown.ordersCount }}
        {{ shown.ordersCount === 1 ? "pedido" : "pedidos" }}
      </p>
      <p v-if="browseError" class="muted error" role="alert">{{ browseError }}</p>
      <p v-else-if="!shown" class="muted">Cargando…</p>
      <template v-if="shown">
      <!-- Un periodo (en curso o cerrado) de mas de un dia: el total o el detalle dia a dia -->
      <SegmentedControl v-if="periodSpansDays" v-model="periodView" :options="PERIOD_VIEWS" aria-label="Cómo ver lo cobrado" class="period-view" />
      <div v-if="periodSpansDays && periodView === 'DIAS'" class="days-wrap">
        <table class="days">
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Efectivo</th>
              <th scope="col">Tarjeta</th>
              <th scope="col">Transf.</th>
              <th v-if="shown.unknownMethodCents" scope="col">Sin método</th>
              <th scope="col">Total</th>
              <th v-if="shown.expensesCount" scope="col">Gastos</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="shownDays === null">
              <td class="muted no-days" colspan="5">Cargando…</td>
            </tr>
            <tr v-else-if="!shownDays.length">
              <td class="muted no-days" :colspan="5 + (shown.unknownMethodCents ? 1 : 0) + (shown.expensesCount ? 1 : 0)">Aún no hay cobros en este periodo</td>
            </tr>
            <tr v-for="d in shownDays ?? []" :key="d.date">
              <th scope="row">
                {{ formatDay(d.date) }}
                <span class="muted day-orders">{{ d.ordersCount }} {{ d.ordersCount === 1 ? "pedido" : "pedidos" }}</span>
              </th>
              <td>{{ formatPrice(d.cashCents) }}</td>
              <td>{{ formatPrice(d.cardCents) }}</td>
              <td>{{ formatPrice(d.transferCents) }}</td>
              <td v-if="shown.unknownMethodCents">{{ formatPrice(d.unknownMethodCents) }}</td>
              <td class="day-total">{{ formatPrice(d.totalCents) }}</td>
              <td v-if="shown.expensesCount">{{ d.expensesCents ? `− ${formatPrice(d.expensesCents)}` : formatPrice(0) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Periodo</th>
              <td>{{ formatPrice(shown.cashCents) }}</td>
              <td>{{ formatPrice(shown.cardCents) }}</td>
              <td>{{ formatPrice(shown.transferCents) }}</td>
              <td v-if="shown.unknownMethodCents">{{ formatPrice(shown.unknownMethodCents) }}</td>
              <td>{{ formatPrice(shown.totalCents) }}</td>
              <td v-if="shown.expensesCount">− {{ formatPrice(shown.expensesTotalCents) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <template v-else>
      <dl class="totals">
        <div><dt><Banknote :size="16" :stroke-width="1.8" aria-hidden="true" /> Efectivo</dt><dd>{{ formatPrice(shown.cashCents) }}</dd></div>
        <div><dt><CreditCard :size="16" :stroke-width="1.8" aria-hidden="true" /> Tarjeta</dt><dd>{{ formatPrice(shown.cardCents) }}</dd></div>
        <div><dt><Smartphone :size="16" :stroke-width="1.8" aria-hidden="true" /> Transferencia</dt><dd>{{ formatPrice(shown.transferCents) }}</dd></div>
        <div v-if="shown.unknownMethodCents">
          <dt><CircleHelp :size="16" :stroke-width="1.8" aria-hidden="true" /> Sin método</dt>
          <dd>{{ formatPrice(shown.unknownMethodCents) }}</dd>
        </div>
        <div class="total"><dt>Total cobrado</dt><dd>{{ formatPrice(shown.totalCents) }}</dd></div>
        <div v-if="shown.expensesCount"><dt><Receipt :size="16" :stroke-width="1.8" aria-hidden="true" /> Gastos</dt><dd>− {{ formatPrice(shown.expensesTotalCents) }}</dd></div>
        <div v-if="shown.expensesCount" class="total"><dt>Resultado neto</dt><dd>{{ formatPrice(shown.netCents) }}</dd></div>
        <!-- No es gasto (no baja el resultado), pero sale del cajon: se ve aparte -->
        <div v-if="shown.bankDepositsCount" class="deposit-row">
          <dt><Landmark :size="16" :stroke-width="1.8" aria-hidden="true" /> Ingresado al banco (sale del cajón)</dt>
          <dd>{{ formatPrice(shown.bankDepositsCents) }}</dd>
        </div>
      </dl>
      <p v-if="shown.unknownMethodCents" class="muted hint">
        «Sin método»: pedidos para llevar o web entregados antes de que se pidiera el método de pago al entregar.
      </p>
      <BalanceTable :balances="shown.balances" :format="formatPrice" />
      </template>
      </template>
    </div>

    <!-- Descuentos del periodo: ya restados de lo cobrado; aqui, cuanto se dejo de cobrar y por que -->
    <div v-if="summary?.discountsCount" class="card">
      <h2 class="card-title">Descuentos del periodo</h2>
      <p class="muted period">
        {{ summary.discountsCount }} {{ summary.discountsCount === 1 ? "pedido" : "pedidos" }} con descuento · ya
        restados del total cobrado
      </p>
      <dl class="totals">
        <div v-for="d in summary.discountsByReason" :key="d.reason">
          <dt>{{ DISCOUNT_REASON_LABELS[d.reason] }} ({{ d.count }})</dt>
          <dd>{{ formatPrice(d.amountCents) }}</dd>
        </div>
        <div class="total"><dt>Total descontado</dt><dd>{{ formatPrice(summary.discountsCents) }}</dd></div>
      </dl>
    </div>

    <!-- Gastos que entraran en este cierre -->
    <div v-if="summary" class="card expenses">
      <div class="expenses-head">
        <h2 class="card-title">Gastos del periodo</h2>
        <button v-if="!adding" class="button secondary" type="button" @click="startAdd">
          <Plus :size="16" :stroke-width="1.8" aria-hidden="true" />
          Añadir gasto
        </button>
      </div>
      <ExpenseForm v-if="adding" @saved="onExpenseSaved" @cancel="adding = false" />
      <EmptyState v-if="!pending.length && !adding" compact :icon="Receipt" title="Sin gastos registrados en este periodo" />
      <ul v-if="pending.length" class="expense-list">
        <li v-for="e in pending" :key="e.id" class="expense">
          <ExpenseForm v-if="editingId === e.id" :existing="e" @saved="onExpenseSaved" @cancel="editingId = ''" />
          <template v-else>
            <div class="expense-main">
              <strong>{{ e.description }}</strong>
              <span class="muted">
                {{ EXPENSE_CATEGORY_LABELS[e.category] }}<template v-if="e.supplier"> · {{ e.supplier }}</template> ·
                {{ EXPENSE_METHOD_LABELS[e.method] }} · {{ formatDateTime(e.spentAt) }} · {{ e.staffName }}
              </span>
            </div>
            <span class="expense-amount" :class="{ cash: e.method === 'CAJA' && e.category !== BANK_DEPOSIT, deposit: e.category === BANK_DEPOSIT }">− {{ formatPrice(e.amountCents) }}</span>
            <div class="expense-actions">
              <button
                v-if="e.receiptUrl"
                type="button"
                class="icon-btn"
                :aria-label="`Ver recibo de ${e.description}`"
                title="Ver recibo"
                @click="openLightbox(resolveImageUrl(e.receiptUrl)!)"
              >
                <ImageIcon :size="16" :stroke-width="1.8" aria-hidden="true" />
              </button>
              <!-- Corregir o borrar: solo gestion (el servidor tambien lo comprueba) -->
              <template v-if="isGestion">
                <button type="button" class="icon-btn" :aria-label="`Editar ${e.description}`" title="Editar" @click="editingId = e.id">
                  <Pencil :size="16" :stroke-width="1.8" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="icon-btn danger"
                  :aria-label="`Borrar ${e.description}`"
                  title="Borrar"
                  @click="deletingId = deletingId === e.id ? '' : e.id"
                >
                  <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                </button>
              </template>
            </div>
            <div v-if="deletingId === e.id" class="confirm delete-confirm" role="alert">
              <p><strong>¿Borrar este gasto?</strong> No se puede deshacer.</p>
              <div class="form-actions">
                <button class="button secondary" type="button" @click="deletingId = ''">No, mantener</button>
                <button class="button secondary cancel" type="button" :disabled="deleting" @click="removeExpense(e.id)">
                  <Trash2 :size="16" :stroke-width="1.8" aria-hidden="true" />
                  Sí, borrar
                </button>
              </div>
            </div>
            <ExpenseItemsBlock :expense="e" :format="formatPrice" @saved="onItemsSaved" />
          </template>
        </li>
      </ul>
      <p v-if="expenseError" class="muted error" role="alert">{{ expenseError }}</p>
      <dl v-if="pending.length" class="totals expenses-totals">
        <div><dt>Pagado de la caja</dt><dd>{{ formatPrice(summary.expensesCashCents) }}</dd></div>
        <div><dt>Otros métodos</dt><dd>{{ formatPrice(summary.expensesOtherCents) }}</dd></div>
        <div v-if="summary.bankDepositsCount"><dt>Ingresado al banco (no es gasto)</dt><dd>{{ formatPrice(summary.bankDepositsCents) }}</dd></div>
      </dl>
    </div>

    <!-- Arqueo del efectivo y cierre -->
    <form v-if="summary" class="card closing-form" @submit.prevent="confirming = true">
      <h2 class="card-title">Arqueo del efectivo</h2>
      <p v-if="savedFloat != null" class="opening-saved">
        <span>Fondo inicial <strong>{{ formatPrice(savedFloat) }}</strong></span>
      </p>
      <p v-else class="muted error">Anota primero el fondo inicial en «Apertura de caja».</p>
      <label class="field">
        <span class="muted">Efectivo contado en la caja</span>
        <input v-model.number="countedCash" type="number" min="0" step="50" inputmode="numeric" required />
      </label>

      <dl class="totals">
        <div>
          <dt>
            Debería haber (fondo + efectivo cobrado{{ summary.expensesCashCents ? " − gastos de la caja" : ""
            }}{{ summary.bankDepositsCents ? " − ingresado al banco" : "" }})
          </dt>
          <dd>{{ formatPrice(expectedInDrawer) }}</dd>
        </div>
        <div v-if="countedValid" class="difference" :class="differenceClass(difference)">
          <dt>{{ differenceLabel(difference) }}</dt>
          <dd>{{ formatPrice(Math.abs(difference)) }}</dd>
        </div>
      </dl>

      <label class="field">
        <span class="muted">Nota (opcional)</span>
        <textarea v-model="note" rows="2" maxlength="500" placeholder="P. ej. un pedido se cobró dos veces" />
      </label>

      <p v-if="closeError" class="muted error" role="alert">{{ closeError }}</p>

      <div v-if="confirming" class="confirm" role="alert">
        <p>
          <strong>¿Cerrar la caja ahora?</strong> Se guardan las cifras y el siguiente cierre empezará desde este
          momento. No se puede deshacer.
        </p>
        <div class="form-actions">
          <button class="button secondary" type="button" :disabled="closing" @click="confirming = false">No, volver</button>
          <button class="button" type="button" :disabled="closing" @click="closeRegister">
            <Check :size="16" :stroke-width="2" aria-hidden="true" />
            {{ closing ? "Cerrando…" : "Sí, cerrar caja" }}
          </button>
        </div>
      </div>
      <button v-else class="button" type="submit" :disabled="!countedValid || savedFloat == null">
        <Lock :size="16" :stroke-width="1.8" aria-hidden="true" />
        Cerrar caja
      </button>
      <p v-if="justClosed" class="muted ok" role="status">Caja cerrada ✓</p>
    </form>

    </div>

    <!-- Historial de cierres -->
    <div class="cash-history">
    <!-- Gastos agrupados de cierres ya hechos que siguen sin desglosar del todo -->
    <div v-if="toItemize.length" class="card expenses">
      <h2 class="card-title">Por desglosar</h2>
      <p class="muted period">Compras apuntadas por su total en cierres anteriores. Desglosarlas no cambia el cierre.</p>
      <ul class="expense-list">
        <li v-for="e in toItemize" :key="e.id" class="expense">
          <div class="expense-main">
            <strong>{{ e.description }}</strong>
            <span class="muted">
              <template v-if="e.supplier">{{ e.supplier }} · </template>{{ formatDateTime(e.spentAt) }} · {{ e.staffName }}
            </span>
          </div>
          <span class="expense-amount">− {{ formatPrice(e.amountCents) }}</span>
          <div v-if="e.receiptUrl" class="expense-actions">
            <button
              type="button"
              class="icon-btn"
              :aria-label="`Ver recibo de ${e.description}`"
              title="Ver recibo"
              @click="openLightbox(resolveImageUrl(e.receiptUrl)!)"
            >
              <ImageIcon :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </div>
          <ExpenseItemsBlock :expense="e" :format="formatPrice" @saved="onItemsSaved" />
        </li>
      </ul>
    </div>
    <CashTrendChart />
    <h2 class="history-title">Cierres anteriores</h2>
    <EmptyState v-if="!closings.length" :icon="Archive" title="Todavía no hay ningún cierre">Aparecerán aquí cada vez que se cierre la caja.</EmptyState>
    <article v-for="c in closings" :key="c.id" class="card closing">
      <header class="closing-head">
        <strong>{{ formatDateTime(c.periodEnd) }}</strong>
        <span class="difference-badge" :class="differenceClass(c.differenceCents)">
          {{ differenceLabel(c.differenceCents) }}{{ c.differenceCents ? ` ${formatPrice(Math.abs(c.differenceCents))}` : "" }}
        </span>
      </header>
      <p class="muted">
        Desde {{ formatDateTime(c.periodStart) }} · {{ c.staffName }} · {{ c.ordersCount }}
        {{ c.ordersCount === 1 ? "pedido" : "pedidos" }}
      </p>
      <!-- Ingresos y gastos: arriba cada metodo con su icono, debajo el total -->
      <div class="closing-money">
        <div class="money-block">
          <span class="money-label">Ingresos</span>
          <span class="money-methods">
            <span v-for="m in incomeByMethod(c)" :key="m.method" class="money-method" :title="m.label">
              <component :is="m.icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
              <span class="vh">{{ m.label }}</span>
              {{ formatPrice(m.cents) }}
            </span>
            <span v-if="!incomeByMethod(c).length" class="muted">—</span>
          </span>
          <strong class="money-total tabular-nums">{{ formatPrice(c.totalCents) }}</strong>
        </div>
        <div v-if="c.expensesCount" class="money-block">
          <span class="money-label">Gastos</span>
          <span class="money-methods">
            <span v-for="m in expensesByMethod(c)" :key="m.method" class="money-method" :title="m.label">
              <component :is="m.icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
              <span class="vh">{{ m.label }}</span>
              − {{ formatPrice(m.cents) }}
            </span>
          </span>
          <strong class="money-total tabular-nums">− {{ formatPrice(c.expensesTotalCents) }}</strong>
        </div>
      </div>
      <p v-if="c.discountsCount" class="closing-figures">
        Descuentos {{ formatPrice(c.discountsCents) }}:
        {{ c.discountsByReason.map((d) => `${DISCOUNT_REASON_LABELS[d.reason]} ${formatPrice(d.amountCents)}`).join(" · ") }}
      </p>
      <p v-if="c.expensesCount" class="closing-figures">Neto {{ formatPrice(c.netCents) }}</p>
      <p v-if="c.bankDepositsCount" class="closing-figures">Ingresado al banco {{ formatPrice(c.bankDepositsCents) }}</p>
      <p class="muted">
        Fondo {{ formatPrice(c.openingFloatCents) }} · Debería haber {{ formatPrice(c.expectedCashInDrawerCents) }} ·
        Contado {{ formatPrice(c.countedCashCents) }}
      </p>
      <p v-if="c.note" class="muted note">Nota: {{ c.note }}</p>
      <button v-if="c.expensesCount || c.bankDepositsCount" type="button" class="link-button" @click="toggleClosingExpenses(c.id)">
        {{ openClosingId === c.id ? "Ocultar detalle" : `Ver detalle y gastos (${c.expensesCount + c.bankDepositsCount})` }}
      </button>
      <BalanceTable v-if="openClosingId === c.id" :balances="c.balances" :format="formatPrice" />
      <ul v-if="openClosingId === c.id" class="expense-list closed">
        <li v-for="e in closingExpenses" :key="e.id" class="expense">
          <div class="expense-main">
            <strong>{{ e.description }}</strong>
            <span class="muted">
              {{ EXPENSE_CATEGORY_LABELS[e.category] }}<template v-if="e.supplier"> · {{ e.supplier }}</template> ·
              {{ EXPENSE_METHOD_LABELS[e.method] }} · {{ formatDateTime(e.spentAt) }} · {{ e.staffName }}
            </span>
          </div>
          <span class="expense-amount" :class="{ cash: e.method === 'CAJA' && e.category !== BANK_DEPOSIT, deposit: e.category === BANK_DEPOSIT }">− {{ formatPrice(e.amountCents) }}</span>
          <div class="expense-actions">
            <button
              v-if="e.receiptUrl"
              type="button"
              class="icon-btn"
              :aria-label="`Ver recibo de ${e.description}`"
              title="Ver recibo"
              @click="openLightbox(resolveImageUrl(e.receiptUrl)!)"
            >
              <ImageIcon :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </div>
          <!-- El desglose no cambia importes: se puede completar con la caja ya cerrada -->
          <ExpenseItemsBlock :expense="e" :format="formatPrice" @saved="onItemsSaved" />
        </li>
      </ul>
    </article>
    </div>

    <ImageLightbox :url="lightboxUrl" @close="closeLightbox" />
  </section>
</template>

<script setup lang="ts">
import EmptyState from "~/components/EmptyState.vue";
import { gql } from "graphql-tag";
import { Archive, Banknote, Check, ChevronLeft, ChevronRight, CircleHelp, CreditCard, ImageIcon, Landmark, Lock, Pencil, Plus, Receipt, Smartphone, Trash2 } from "lucide-vue-next";
import { useStoreTime } from "~/composables/useStoreTime";
import { useStaffAuth } from "~/composables/useAuth";
import { useLightbox } from "~/composables/useLightbox";
import { useImageUrl } from "~/composables/useImageUrl";
import { DISCOUNT_REASON_LABELS, type DiscountReason } from "~/composables/useStaffOrders";
import { BANK_DEPOSIT, EXPENSE_CATEGORY_LABELS, EXPENSE_FIELDS, EXPENSE_METHOD_LABELS, type Expense } from "~/composables/useExpenses";
import ExpenseForm from "~/components/ExpenseForm.vue";
import ExpenseItemsBlock from "~/components/ExpenseItemsBlock.vue";
import CashTrendChart from "~/components/CashTrendChart.vue";
import ImageLightbox from "~/components/ImageLightbox.vue";
import BalanceTable, { type MethodBalance } from "~/components/CashBalanceTable.vue";
import CashPreviousDays, { PREVIOUS_DAYS_FIELDS, type PendingPreviousDays } from "~/components/CashPreviousDays.vue";

interface CashSummary {
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  unknownMethodCents: number;
  discountsCount: number;
  discountsCents: number;
  discountsByReason: { reason: DiscountReason; count: number; amountCents: number }[];
  expensesCount: number;
  expensesCashCents: number;
  expensesOtherCents: number;
  expensesTotalCents: number;
  bankDepositsCount: number;
  bankDepositsCents: number;
  netCents: number;
  balances: MethodBalance[];
  openingFloatCents?: number | null;
  openingFloatStaffName?: string | null;
  openingFloatAt?: string | null;
  days?: CashSummaryDay[];
  previousDays?: PendingPreviousDays | null;
}
interface CashSummaryDay {
  date: string;
  ordersCount: number;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  transferCents: number;
  unknownMethodCents: number;
  expensesCents: number;
}
const DAY_FIELDS = "days { date ordersCount totalCents cashCents cardCents transferCents unknownMethodCents expensesCents }";
interface CashClosing extends CashSummary {
  id: string;
  staffName: string;
  openingFloatCents: number;
  countedCashCents: number;
  expectedCashInDrawerCents: number;
  differenceCents: number;
  note: string | null;
}

const SUMMARY_FIELDS = `periodStart periodEnd ordersCount totalCents cashCents cardCents transferCents unknownMethodCents
  discountsCount discountsCents discountsByReason { reason count amountCents }
  expensesCount expensesCashCents expensesOtherCents expensesTotalCents netCents bankDepositsCount bankDepositsCents
  balances { method inCents outCents balanceCents }`;
const CASH_QUERY = gql`
  query CashClosingData {
    cashSummary { ${SUMMARY_FIELDS} openingFloatCents openingFloatStaffName openingFloatAt ${DAY_FIELDS} ${PREVIOUS_DAYS_FIELDS} }
    pendingExpenses { ${EXPENSE_FIELDS} }
    expensesToItemize { ${EXPENSE_FIELDS} }
    cashClosings(limit: 30) {
      id ${SUMMARY_FIELDS} staffName openingFloatCents countedCashCents expectedCashInDrawerCents differenceCents note
    }
  }
`;
const CLOSE_CASH = gql`
  mutation CloseCashRegister($openingFloatCents: Int!, $countedCashCents: Int!, $note: String) {
    closeCashRegister(openingFloatCents: $openingFloatCents, countedCashCents: $countedCashCents, note: $note) {
      id
    }
  }
`;

const SET_FLOAT = gql`
  mutation SetOpeningFloat($amountCents: Int!) {
    setOpeningFloat(amountCents: $amountCents) { ${SUMMARY_FIELDS} openingFloatCents openingFloatStaffName openingFloatAt ${DAY_FIELDS} ${PREVIOUS_DAYS_FIELDS} }
  }
`;

const { formatDateTime, timeZone } = useStoreTime();
const CLOSING_EXPENSES = gql`
  query ClosingExpenses($closingId: ID!) {
    closingExpenses(closingId: $closingId) { ${EXPENSE_FIELDS} }
  }
`;
const DELETE_EXPENSE = gql`
  mutation DeleteExpense($id: ID!) {
    deleteExpense(id: $id)
  }
`;

const { result, error, refetch } = useQuery<{
  cashSummary: CashSummary;
  pendingExpenses: Expense[];
  expensesToItemize: Expense[];
  cashClosings: CashClosing[];
}>(CASH_QUERY, null, { fetchPolicy: "network-only" });
const { mutate: closeCash } = useMutation(CLOSE_CASH);

const summary = computed(() => result.value?.cashSummary ?? null);
const closings = computed(() => result.value?.cashClosings ?? []);

// Historial: importes por metodo con su icono (solo los que tienen algo).
const METHOD_ICONS = {
  EFECTIVO: { icon: Banknote, label: "Efectivo" },
  TARJETA: { icon: CreditCard, label: "Tarjeta" },
  TRANSFERENCIA: { icon: Smartphone, label: "Transferencia" },
  OTRO: { icon: CircleHelp, label: "Otro / sin método" },
} as const;
type MethodKey = keyof typeof METHOD_ICONS;
function byMethod(entries: [MethodKey, number][]) {
  return entries.filter(([, cents]) => cents > 0).map(([method, cents]) => ({ method, cents, ...METHOD_ICONS[method] }));
}
function incomeByMethod(c: { cashCents: number; cardCents: number; transferCents: number; unknownMethodCents: number }) {
  return byMethod([
    ["EFECTIVO", c.cashCents],
    ["TARJETA", c.cardCents],
    ["TRANSFERENCIA", c.transferCents],
    ["OTRO", c.unknownMethodCents],
  ]);
}
// Los gastos por metodo salen del saldo por metodo (lo pagado); el de la caja va como efectivo.
function expensesByMethod(c: { balances: MethodBalance[] }) {
  return byMethod(
    (["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"] as MethodKey[]).map((m) => [m, c.balances.find((b) => b.method === m)?.outCents ?? 0]),
  );
}
const lastClosing = computed(() => closings.value[0] ?? null);

// Lo cobrado en el periodo: en total (por metodo) o dia a dia.
const PERIOD_VIEWS = [
  { value: "TOTAL" as const, label: "Total" },
  { value: "DIAS" as const, label: "Por día" },
];
const periodView = ref<"TOTAL" | "DIAS">("TOTAL");

// --- Navegar por lo cobrado: por cierres (0 = el periodo en curso, 1 = el ultimo cierre...) o por dias ---
const BROWSE_MODES = [
  { value: "CIERRES" as const, label: "Cierres" },
  { value: "DIAS" as const, label: "Días" },
];
const browseMode = ref<"CIERRES" | "DIAS">("CIERRES");
const closingIndex = ref(0);
/** "YYYY-MM-DD" de hoy en la zona del local. */
function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function shiftDay(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
const dayDate = ref(todayKey());
const browseError = ref("");
const browseLoading = ref(false);

const shownClosing = computed(() => (browseMode.value === "CIERRES" && closingIndex.value > 0 ? closings.value[closingIndex.value - 1] ?? null : null));
const canOlder = computed(() => (browseMode.value === "CIERRES" ? closingIndex.value < closings.value.length : true));
const canNewer = computed(() => (browseMode.value === "CIERRES" ? closingIndex.value > 0 : dayDate.value < todayKey()));
function older() {
  if (!canOlder.value) return;
  if (browseMode.value === "CIERRES") closingIndex.value++;
  else dayDate.value = shiftDay(dayDate.value, -1);
}
function newer() {
  if (!canNewer.value) return;
  if (browseMode.value === "CIERRES") closingIndex.value--;
  else dayDate.value = shiftDay(dayDate.value, 1);
}
// Al cambiar de modo se vuelve a lo de ahora (el periodo en curso, o hoy).
watch(browseMode, () => {
  closingIndex.value = 0;
  dayDate.value = todayKey();
  browseError.value = "";
});
// Tras cerrar la caja, la lista de cierres cambia: se vuelve al periodo en curso.
watch(() => closings.value[0]?.id, () => (closingIndex.value = 0));

const CASH_DAY = gql`
  query CashDay($date: String!) {
    cashDay(date: $date) { ${SUMMARY_FIELDS} ${DAY_FIELDS} }
  }
`;
const CLOSING_DAYS = gql`
  query CashClosingDays($id: ID!) {
    cashClosingDays(id: $id) { date ordersCount totalCents cashCents cardCents transferCents unknownMethodCents expensesCents }
  }
`;
const daySummary = ref<CashSummary | null>(null);
const closingDays = ref<Record<string, CashSummaryDay[]>>({});
const apollo = () => useNuxtApp().$apollo.defaultClient;
async function loadDay(date: string) {
  daySummary.value = null;
  browseError.value = "";
  browseLoading.value = true;
  try {
    const { data } = await apollo().query({ query: CASH_DAY, variables: { date }, fetchPolicy: "network-only" });
    if (dayDate.value === date) daySummary.value = data?.cashDay ?? null;
  } catch (err: any) {
    browseError.value = err?.message ?? "No se pudo cargar ese día";
  } finally {
    browseLoading.value = false;
  }
}
watch([browseMode, dayDate], ([mode, date]) => {
  if (mode === "DIAS") loadDay(date);
});
async function loadClosingDays(id: string) {
  if (closingDays.value[id]) return;
  try {
    const { data } = await apollo().query({ query: CLOSING_DAYS, variables: { id }, fetchPolicy: "network-only" });
    closingDays.value = { ...closingDays.value, [id]: data?.cashClosingDays ?? [] };
  } catch (err: any) {
    browseError.value = err?.message ?? "No se pudo cargar el detalle por día";
  }
}
/** "YYYY-MM-DD" de un instante en la zona del local. */
function storeDayOf(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
// El desglose por dia solo tiene sentido si el periodo abarca mas de un dia.
const periodSpansDays = computed(() => {
  const s = shown.value;
  if (browseMode.value !== "CIERRES" || !s) return false;
  const end = shownClosing.value ? s.periodEnd : new Date().toISOString();
  return storeDayOf(s.periodStart) !== storeDayOf(end);
});

/** Lo que se ve en la tarjeta: el periodo en curso, un cierre pasado o un dia. */
const shown = computed<CashSummary | CashClosing | null>(() => {
  if (browseMode.value === "DIAS") return daySummary.value;
  return shownClosing.value ?? summary.value;
});
const shownDays = computed<CashSummaryDay[] | null>(() => {
  if (shownClosing.value) return closingDays.value[shownClosing.value.id] ?? null;
  return summary.value?.days ?? [];
});
watch([shownClosing, periodView, periodSpansDays], ([c, view, spans]) => {
  if (c && view === "DIAS" && spans) loadClosingDays(c.id);
});
const shownTitle = computed(() => {
  if (browseMode.value === "DIAS") return dayDate.value === todayKey() ? "Cobrado hoy" : `Cobrado el ${formatDay(dayDate.value)}`;
  if (shownClosing.value) return `Cierre de ${shownClosing.value.staffName}`;
  return `Cobrado desde ${lastClosing.value ? "el último cierre" : "el primer pedido (aún no hay cierres)"}`;
});
const shownRange = computed(() => {
  const s = shown.value;
  if (!s) return "";
  if (browseMode.value === "DIAS") return "";
  return `${formatDateTime(s.periodStart)} → ${shownClosing.value ? formatDateTime(s.periodEnd) : "ahora"}`;
});
/** "sáb 21 nov" de un "YYYY-MM-DD" (es la fecha del local: se lee en UTC para no moverla). */
function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-ES", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}
const summaryError = computed(() => (error.value ? "No se pudo cargar la caja." : ""));
const pending = computed(() => result.value?.pendingExpenses ?? []);
const toItemize = computed(() => result.value?.expensesToItemize ?? []);

// --- Gastos: cualquiera los añade; corregir y borrar, solo gestion ---
const { staff } = useStaffAuth();
const isGestion = computed(() => staff.value?.role === "gestion");
const { lightboxUrl, openLightbox, closeLightbox } = useLightbox();
const { resolveImageUrl } = useImageUrl();
const adding = ref(false);
const editingId = ref("");
const deletingId = ref("");
const deleting = ref(false);
const expenseError = ref("");
const { mutate: deleteExpenseMutation } = useMutation(DELETE_EXPENSE);

function startAdd() {
  editingId.value = "";
  adding.value = true;
}
// Tras guardar, se vuelve a pedir todo: el resumen y el arqueo dependen de los gastos.
async function onExpenseSaved() {
  adding.value = false;
  editingId.value = "";
  expenseError.value = "";
  await refetch();
}
async function removeExpense(id: string) {
  deleting.value = true;
  expenseError.value = "";
  try {
    await deleteExpenseMutation({ id });
    deletingId.value = "";
    await refetch();
  } catch (err: any) {
    expenseError.value = err?.message ?? "No se pudo borrar el gasto";
  } finally {
    deleting.value = false;
  }
}

// Desglose guardado: el gasto abierto de un cierre se actualiza en su sitio; el resto, con la recarga.
async function onItemsSaved(saved: Expense) {
  closingExpenses.value = closingExpenses.value.map((e) => (e.id === saved.id ? saved : e));
  await refetch();
}

// Gastos de un cierre del historial: se piden al abrirlos.
const openClosingId = ref("");
const closingExpenses = ref<Expense[]>([]);
async function toggleClosingExpenses(closingId: string) {
  if (openClosingId.value === closingId) {
    openClosingId.value = "";
    return;
  }
  const { data } = await useNuxtApp().$apollo.defaultClient.query({
    query: CLOSING_EXPENSES,
    variables: { closingId },
    fetchPolicy: "network-only",
  });
  closingExpenses.value = data?.closingExpenses ?? [];
  openClosingId.value = closingId;
}

// El fondo suele repetirse de un dia a otro: hasta anotarlo, se propone el del ultimo cierre.
const openingFloat = ref<number | "">("");
watch(lastClosing, (last) => {
  if (openingFloat.value === "" && last) openingFloat.value = last.openingFloatCents;
}, { immediate: true });
// El anotado al abrir la caja: es el que usa el arqueo y el cierre.
const savedFloat = computed(() => summary.value?.openingFloatCents ?? null);
const editingFloat = ref(false);
const savingFloat = ref(false);
const floatError = ref("");
const { mutate: setFloat } = useMutation(SET_FLOAT);
function startEditFloat() {
  openingFloat.value = savedFloat.value ?? "";
  floatError.value = "";
  editingFloat.value = true;
}
async function saveFloat() {
  if (!floatValid.value || savingFloat.value) return;
  savingFloat.value = true;
  floatError.value = "";
  try {
    // El aviso de la barra superior (CashFloatNotice) se actualiza al momento.
    await setFloat({ amountCents: Math.round(openingFloat.value as number) }, { refetchQueries: ["CashOpeningPending"] });
    editingFloat.value = false;
    await refetch();
  } catch (err: any) {
    floatError.value = err?.message ?? "No se pudo guardar el fondo";
  } finally {
    savingFloat.value = false;
  }
}
const countedCash = ref<number | "">("");
const note = ref("");

// Lo que quedo sin cerrar de dias anteriores: se avisa en la apertura (hasta cerrarlo o «Ahora no»,
// que vale para ese periodo en esta pantalla) y el fondo de hoy se anota despues.
const previousDaysDismissed = ref("");
const showPreviousDays = computed(() => {
  const pd = summary.value?.previousDays;
  return !!pd && previousDaysDismissed.value !== pd.periodStart;
});
const todayCashCents = computed(() => summary.value?.days?.find((d) => d.date === todayKey())?.cashCents ?? 0);
async function onPreviousDaysClosed() {
  editingFloat.value = false;
  await refetch();
}

const floatValid = computed(() => typeof openingFloat.value === "number" && openingFloat.value >= 0);
const countedValid = computed(() => typeof countedCash.value === "number" && countedCash.value >= 0);
const expectedInDrawer = computed(
  () =>
    (savedFloat.value ?? 0) +
    (summary.value?.cashCents ?? 0) -
    (summary.value?.expensesCashCents ?? 0) -
    (summary.value?.bankDepositsCents ?? 0)
);
const difference = computed(() => (countedValid.value ? (countedCash.value as number) - expectedInDrawer.value : 0));

function differenceLabel(cents: number) {
  return cents === 0 ? "Cuadra" : cents < 0 ? "Falta" : "Sobra";
}
function differenceClass(cents: number) {
  return cents === 0 ? "even" : cents < 0 ? "short" : "over";
}
function formatPrice(cents: number) {
  return cents.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

const confirming = ref(false);
const closing = ref(false);
const closeError = ref("");
const justClosed = ref(false);

async function closeRegister() {
  if (!countedValid.value || savedFloat.value == null) return;
  closing.value = true;
  closeError.value = "";
  try {
    await closeCash({
      openingFloatCents: savedFloat.value,
      countedCashCents: Math.round(countedCash.value as number),
      note: note.value.trim() || null,
    }, { refetchQueries: ["CashOpeningPending"] });
    countedCash.value = "";
    note.value = "";
    confirming.value = false;
    justClosed.value = true;
    setTimeout(() => (justClosed.value = false), 4000);
    await refetch();
  } catch (err: any) {
    closeError.value = err?.message ?? "No se pudo cerrar la caja";
    confirming.value = false;
    await refetch()?.catch(() => {});
  } finally {
    closing.value = false;
  }
}
</script>

<style scoped>
.cash { display: flex; flex-direction: column; gap: 16px; max-width: 560px; }
.cash-current, .cash-history { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
/* Pantallas anchas y apaisadas: mas ancho que la pagina (como la cola) y dos columnas, con el
   periodo actual a la izquierda y el historial a la derecha. */
@media (min-width: 1000px) and (orientation: landscape) {
  .cash {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    grid-template-areas: "current history";
    align-items: start;
    gap: 28px;
    max-width: none;
    width: min(1160px, calc(100vw - 40px));
    position: relative;
    left: 50%;
    transform: translateX(-50%);
  }
  .cash-current { grid-area: current; }
  .cash-history { grid-area: history; }
  .cash-history .history-title { margin-top: 0; }
}
.card-title { font-size: 17px; margin: 0 0 4px; }
.period { margin: 0 0 12px; font-size: 13px; }
.totals { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.totals > div { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.totals dt { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); }
.totals dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.totals .total { border-top: 1px solid var(--field-border); padding-top: 6px; margin-top: 2px; }
.totals .total dt { color: var(--text); font-weight: 700; }
.hint { font-size: 12.5px; margin: 10px 0 0; }

.closing-form { display: flex; flex-direction: column; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field input, .field textarea {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--field-border);
  font-size: 16px;
  font-family: inherit;
}
/* Diferencia del arqueo: verde-azulado si cuadra o sobra, rojo si falta */
.difference.even dt, .difference.even dd, .difference.over dt, .difference.over dd { color: var(--accent-strong); }
.difference.short dt, .difference.short dd { color: var(--danger); }
.difference dt { font-weight: 700; }

.confirm {
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--field-border);
  background: var(--surface-alt);
}
.confirm p { margin: 0 0 10px; font-size: 14px; }
.form-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.period-view { margin-bottom: 12px; }
.browse { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.browse-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--field-border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.browse-arrow:disabled { opacity: 0.35; cursor: not-allowed; }
.days-wrap { overflow-x: auto; }
.days { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
.days th, .days td { padding: 6px 4px; text-align: right; border-bottom: 1px solid var(--field-border); white-space: nowrap; }
.days thead th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 600; }
.days th[scope="row"] { text-align: left; font-weight: 600; }
.days thead th:first-child { text-align: left; }
.days td.no-days { text-align: left; }
.day-orders { display: block; font-size: 12px; font-weight: 400; }
.day-total, .days tfoot th, .days tfoot td { font-weight: 700; }
.days tfoot th, .days tfoot td { border-bottom: none; }
.opening-saved { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 4px; }
.opening-saved strong { font-size: 18px; font-variant-numeric: tabular-nums; }
.opening .period { margin-bottom: 0; }
.opening .field { margin-bottom: 12px; }
.error { color: var(--danger); margin: 0; }
.ok { color: var(--accent-strong); margin: 0; }

.history-title { font-size: 17px; margin: 12px 0 0; }
.closing p { margin: 4px 0 0; }
.closing-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.closing-figures { font-size: 14px; }
/* Ingresos y gastos del cierre: etiqueta, metodos con icono y total debajo */
.closing-money { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 20px; margin-top: 10px; }
.money-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.money-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.money-methods { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 14px; font-variant-numeric: tabular-nums; }
.money-method { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.money-method svg { color: var(--text-muted); }
.money-total { font-family: var(--font-futura-text); font-size: 19px; font-weight: 900; line-height: 1.2; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.expenses { display: flex; flex-direction: column; gap: 12px; }
.expenses-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.expense-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.expense {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--field-border);
}
.expense:last-child { border-bottom: none; }
.expense .expense-form, .expense .delete-confirm { flex-basis: 100%; }
.expense-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 180px; }
.expense-main .muted { font-size: 13px; }
.expense-amount { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.expense-amount.cash { color: var(--danger); }
.expense-amount.deposit { color: var(--accent); }
.expense-actions { display: flex; gap: 4px; }
.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--field-border);
  border-radius: 50%;
  background: none;
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn.danger { color: var(--danger); }
.icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.expenses-totals { border-top: 1px solid var(--field-border); padding-top: 8px; }
.expense-list.closed { margin-top: 8px; }
.link-button {
  align-self: flex-start;
  border: none;
  background: none;
  padding: 4px 0 0;
  color: var(--accent);
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.note { font-style: italic; }
.difference-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--bg);
  background: var(--accent-strong);
}
.difference-badge.short { background: var(--danger); }
</style>
